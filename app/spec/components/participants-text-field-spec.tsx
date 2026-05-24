import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { ContactStore, Contact } from 'actunamail-exports';

import { ParticipantsTextField } from 'actunamail-component-kit';

const participant1 = new Contact({
  id: 'local-1',
  email: 'ben@actunamail.test',
});
const participant2 = new Contact({
  id: 'local-2',
  email: 'ben@example.com',
  name: 'Ben Gotow',
});
const participant3 = new Contact({
  id: 'local-3',
  email: 'evan@actunamail.test',
  name: 'Evan Morikawa',
});

xdescribe('ParticipantsTextField', function ParticipantsTextFieldSpecs() {
  afterEach(cleanup);

  beforeEach(function () {
    spyOn(AppEnv, 'isMainWindow').andReturn(true);
    this.propChange = jasmine.createSpy('change');

    this.fieldName = 'to';
    this.participants = {
      to: [participant1, participant2],
      cc: [participant3],
      bcc: [],
    };

    const { container } = render(
      <ParticipantsTextField
        field={this.fieldName}
        label={this.fieldName}
        visible
        participants={this.participants}
        draft={{ id: 'draft-1' } as any}
        session={{} as any}
        change={this.propChange}
      />
    );
    this.container = container;

    this.expectInputToYield = (input, expected) => {
      const reviver = function reviver(k, v) {
        if (k === 'id' || k === 'client_id' || k === 'server_id' || k === 'object') {
          return undefined;
        }
        return v;
      };
      runs(() => {
        const inputEl = this.container.querySelector('input');
        fireEvent.change(inputEl, { target: { value: input } });
        advanceClock(100);
        return fireEvent.keyDown(inputEl, { key: 'Enter', keyCode: 9 });
      });
      waitsFor(() => {
        return this.propChange.calls.length > 0;
      });
      runs(() => {
        let found = this.propChange.mostRecentCall.args[0];
        found = JSON.parse(JSON.stringify(found), reviver);
        expect(found).toEqual(JSON.parse(JSON.stringify(expected), reviver));

        // This advance clock needs to be here because our waitsFor latch
        // catches the first time that propChange gets called. More stuff
        // may happen after this and we need to advance the clock to
        // "clear" all of that. If we don't do this it throws errors about
        // `setState` being called on unmounted components :(
        return advanceClock(100);
      });
    };
  });

  it('renders into the document', function () {
    expect(this.container.querySelector('input') !== null).toBe(true);
  });

  describe('inserting participant text', () => {
    it('should fire onChange with an updated participants hash', function () {
      this.expectInputToYield('abc@abc.com', {
        to: [
          participant1,
          participant2,
          new Contact({ name: 'abc@abc.com', email: 'abc@abc.com' }),
        ],
        cc: [participant3],
        bcc: [],
      });
    });

    it('should remove added participants from other fields', function () {
      this.expectInputToYield(participant3.email, {
        to: [
          participant1,
          participant2,
          new Contact({ name: participant3.email, email: participant3.email }),
        ],
        cc: [],
        bcc: [],
      });
    });

    it('should use the name of an existing contact in the ContactStore if possible', function () {
      spyOn(ContactStore, 'searchContacts').andCallFake((val) => {
        if (val === participant3.name) {
          return Promise.resolve([participant3]);
        }
        return Promise.resolve([]);
      });

      this.expectInputToYield(participant3.name, {
        to: [participant1, participant2, participant3],
        cc: [],
        bcc: [],
      });
    });

    it("should use the plain email if that's what's entered", function () {
      spyOn(ContactStore, 'searchContacts').andCallFake((val) => {
        if (val === participant3.name) {
          return Promise.resolve([participant3]);
        }
        return Promise.resolve([]);
      });

      this.expectInputToYield(participant3.email, {
        to: [participant1, participant2, new Contact({ email: 'evan@actunamail.test' })],
        cc: [],
        bcc: [],
      });
    });

    it('should not have the same contact auto-picked multiple times', function () {
      spyOn(ContactStore, 'searchContacts').andCallFake((val) => {
        if (val === participant2.name) {
          return Promise.resolve([participant2]);
        }
        return Promise.resolve([]);
      });

      this.expectInputToYield(participant2.name, {
        to: [
          participant1,
          participant2,
          new Contact({ email: participant2.name, name: participant2.name }),
        ],
        cc: [participant3],
        bcc: [],
      });
    });

    describe('when text contains Name (Email) formatted data', () => {
      it('should correctly parse it into named Contact objects', function () {
        const newContact1 = new Contact({
          id: 'b1',
          name: 'Ben Imposter',
          email: 'imposter@actunamail.test',
        });
        const newContact2 = new Contact({
          name: 'ActunaMail Team',
          email: 'feedback@actunamail.test',
        });

        const inputs = [
          'Ben Imposter <imposter@actunamail.test>, ActunaMail Team <feedback@actunamail.test>',
          '\n\nbla\nBen Imposter (imposter@actunamail.test), ActunaMail Team (feedback@actunamail.test)',
          'Hello world! I like cheese. \rBen Imposter (imposter@actunamail.test)\nActunaMail Team (feedback@actunamail.test)',
          'Ben Imposter<imposter@actunamail.test>ActunaMail Team (feedback@actunamail.test)',
        ];

        for (const input of inputs) {
          this.expectInputToYield(input, {
            to: [participant1, participant2, newContact1, newContact2],
            cc: [participant3],
            bcc: [],
          });
        }
      });
    });

    describe('when text contains emails mixed with garbage text', () => {
      it('should still parse out emails into Contact objects', function () {
        const newContact1 = new Contact({
          id: 'gm',
          name: 'garbage-man@actunamail.test',
          email: 'garbage-man@actunamail.test',
        });
        const newContact2 = new Contact({
          id: 'rm',
          name: 'recycling-guy@actunamail.test',
          email: 'recycling-guy@actunamail.test',
        });

        const inputs = [
          "Hello world I real. \n asd. garbage-man@actunamail.test—he's cool Also 'recycling-guy@actunamail.test'!",
          'garbage-man@actunamail.test1WHOA I REALLY HATE DATA,recycling-guy@actunamail.test',
          'nils.com garbage-man@actunamail.test @actunamail.test nope@.com nope! recycling-guy@actunamail.test HOLLA AT recycling-guy@actunamail.',
        ];

        for (const input of inputs) {
          this.expectInputToYield(input, {
            to: [participant1, participant2, newContact1, newContact2],
            cc: [participant3],
            bcc: [],
          });
        }
      });
    });
  });
});
