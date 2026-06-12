/* eslint quote-props: 0 */
import { Thread } from '../../src/flux/models/thread';
import TestModel from '../fixtures/db-test-model';
import ModelQuery from '../../src/flux/models/query';
import DatabaseStore from '../../src/flux/stores/database-store';
import { DatabaseChangeRecord } from '../../src/flux/stores/database-change-record';

const testMatchers = { id: 'b' };

describe('DatabaseStore', function DatabaseStoreSpecs() {
  beforeEach(() => {
    (TestModel as any).configureBasic();
    spyOn(ModelQuery.prototype, 'where').andCallThrough();

    this.performed = [];

    // Note: We spy on _query and test all of the convenience methods that sit above
    // it. None of these tests evaluate whether _query works!
    jasmine.unspy(DatabaseStore, '_query');
    spyOn(DatabaseStore, '_query').andCallFake((query, values = []) => {
      this.performed.push({ query, values });
      return Promise.resolve([]);
    });
  });

  describe('find', () =>
    it('should return a ModelQuery for retrieving a single item by Id', () => {
      const q = DatabaseStore.find(TestModel, '4');
      expect(q.sql()).toBe(
        "SELECT `TestModel`.`data` FROM `TestModel`  WHERE `TestModel`.`id` = '4'  LIMIT 1"
      );
    }));

  describe('findBy', () => {
    it('should pass the provided predicates on to the ModelQuery', () => {
      DatabaseStore.findBy<TestModel>(TestModel, testMatchers);
      expect(ModelQuery.prototype.where).toHaveBeenCalledWith(testMatchers);
    });

    it('should return a ModelQuery ready to be executed', () => {
      const q = DatabaseStore.findBy<TestModel>(TestModel, testMatchers);
      expect(q.sql()).toBe(
        "SELECT `TestModel`.`data` FROM `TestModel`  WHERE `TestModel`.`id` = 'b'  LIMIT 1"
      );
    });
  });

  describe('findAll', () => {
    it('should pass the provided predicates on to the ModelQuery', () => {
      DatabaseStore.findAll<TestModel>(TestModel, testMatchers);
      expect(ModelQuery.prototype.where).toHaveBeenCalledWith(testMatchers);
    });

    it('should return a ModelQuery ready to be executed', () => {
      const q = DatabaseStore.findAll<TestModel>(TestModel, testMatchers);
      expect(q.sql()).toBe(
        "SELECT `TestModel`.`data` FROM `TestModel`  WHERE `TestModel`.`id` = 'b'  "
      );
    });
  });

  describe('modelify', () => {
    beforeEach(() => {
      this.models = [
        new Thread({ id: 'local-A' }),
        new Thread({ id: 'local-B' }),
        new Thread({ id: 'local-C' }),
        new Thread({ id: 'local-D' }),
        new Thread({ id: 'local-E' }),
        new Thread({ id: 'local-F' }),
        new Thread({ id: 'local-G' }),
      ];
      // Actually returns correct sets for queries, since matchers can evaluate
      // themselves against models in memory
      spyOn(DatabaseStore, 'run').andCallFake((query) => {
        const results = this.models.filter((model) =>
          query._matchers.every((matcher) => matcher.evaluate(model))
        );
        return Promise.resolve(results);
      });
    });

    describe('when given an array or input that is not an array', () =>
      it('resolves immediately with an empty array', () =>
        waitsForPromise(() => {
          return DatabaseStore.modelify(Thread, null).then((output) => {
            expect(output).toEqual([]);
          });
        })));

    describe('when given an array of mixed IDs, and models', () =>
      it('resolves with an array of models', () => {
        const input = ['local-F', 'local-B', 'local-C', 'local-D', this.models[6]];
        const expectedOutput = [
          this.models[5],
          this.models[1],
          this.models[2],
          this.models[3],
          this.models[6],
        ];
        return waitsForPromise(() => {
          return DatabaseStore.modelify(Thread, input).then((output) => {
            expect(output).toEqual(expectedOutput);
          });
        });
      }));

    describe('when the input is only IDs', () =>
      it('resolves with an array of models', () => {
        const input = ['local-D', 'local-F', 'local-G'];
        const expectedOutput = [this.models[3], this.models[5], this.models[6]];
        return waitsForPromise(() => {
          return DatabaseStore.modelify(Thread, input).then((output) => {
            expect(output).toEqual(expectedOutput);
          });
        });
      }));

    describe('when the input is all models', () =>
      it('resolves with an array of models', () => {
        const input = [this.models[0], this.models[1], this.models[2], this.models[3]];
        const expectedOutput = [this.models[0], this.models[1], this.models[2], this.models[3]];
        return waitsForPromise(() => {
          return DatabaseStore.modelify(Thread, input).then((output) => {
            expect(output).toEqual(expectedOutput);
          });
        });
      }));
  });

  describe('count', () => {
    it('should pass the provided predicates on to the ModelQuery', () => {
      DatabaseStore.findAll<TestModel>(TestModel, testMatchers);
      expect(ModelQuery.prototype.where).toHaveBeenCalledWith(testMatchers);
    });

    it('should return a ModelQuery configured for COUNT ready to be executed', () => {
      const q = DatabaseStore.findAll<TestModel>(TestModel, testMatchers);
      expect(q.sql()).toBe(
        "SELECT `TestModel`.`data` FROM `TestModel`  WHERE `TestModel`.`id` = 'b'  "
      );
    });
  });

  // #122: level-triggered reconciliation — delty są ulotne (fire-and-forget),
  // więc konsument budujący stan z delt musi dostać initial state z DB bez luki
  // między rejestracją listenera a odczytem. Kolejność: listener NAJPIERW,
  // potem query; wyniki initial przychodzą jako syntetyczny 'persist'
  // DatabaseChangeRecord do TEGO SAMEGO callbacku (konsument idempotentny).
  describe('listenWithInitialQuery', () => {
    beforeEach(() => {
      this.received = [];
      this.callback = (change) => this.received.push(change);
      // Dwa ticki mikrotasków — dostawa initial idzie przez łańcuch promise.
      this.flushMicrotasks = () =>
        Promise.resolve()
          .then(() => {})
          .then(() => {});
    });

    it('registers the delta listener BEFORE running the initial query', () => {
      const order = [];
      spyOn(DatabaseStore, 'listen').andCallFake(() => {
        order.push('listen');
        return () => {};
      });
      spyOn(DatabaseStore, 'run').andCallFake(() => {
        order.push('run');
        return Promise.resolve([]);
      });
      DatabaseStore.listenWithInitialQuery(DatabaseStore.findAll<TestModel>(TestModel), this.callback);
      expect(order).toEqual(['listen', 'run']);
    });

    it('delivers initial query results as a persist DatabaseChangeRecord', () => {
      const models = [new TestModel({ id: 'init-a' }), new TestModel({ id: 'init-b' })];
      spyOn(DatabaseStore, 'run').andCallFake(() => Promise.resolve(models));
      const unsub = DatabaseStore.listenWithInitialQuery(
        DatabaseStore.findAll<TestModel>(TestModel),
        this.callback
      );
      return waitsForPromise(() => {
        return this.flushMicrotasks().then(() => {
          expect(this.received.length).toBe(1);
          expect(this.received[0].type).toBe('persist');
          expect(this.received[0].objectClass).toBe('TestModel');
          expect(this.received[0].objects).toEqual(models);
          unsub();
        });
      });
    });

    it('forwards delta change records arriving after subscribe to the same callback', () => {
      spyOn(DatabaseStore, 'run').andCallFake(() => Promise.resolve([]));
      const unsub = DatabaseStore.listenWithInitialQuery(
        DatabaseStore.findAll<TestModel>(TestModel),
        this.callback
      );
      const delta = new DatabaseChangeRecord({
        type: 'persist',
        objectClass: 'TestModel',
        objects: [new TestModel({ id: 'delta-c' })],
        objectsRawJSON: [],
      });
      DatabaseStore.trigger(delta);
      expect(this.received).toContain(delta);
      unsub();
    });

    it('does not deliver initial results after unsubscribe', () => {
      let resolveRun;
      spyOn(DatabaseStore, 'run').andCallFake(() => new Promise((resolve) => (resolveRun = resolve)));
      const unsub = DatabaseStore.listenWithInitialQuery(
        DatabaseStore.findAll<TestModel>(TestModel),
        this.callback
      );
      unsub();
      resolveRun([new TestModel({ id: 'late-d' })]);
      return waitsForPromise(() => {
        return this.flushMicrotasks().then(() => {
          expect(this.received.length).toBe(0);
        });
      });
    });

    it('keeps the delta listener alive when the initial query rejects', () => {
      spyOn(DatabaseStore, 'run').andCallFake(() => Promise.reject(new Error('db not ready')));
      const unsub = DatabaseStore.listenWithInitialQuery(
        DatabaseStore.findAll<TestModel>(TestModel),
        this.callback
      );
      const delta = new DatabaseChangeRecord({
        type: 'persist',
        objectClass: 'TestModel',
        objects: [new TestModel({ id: 'delta-e' })],
        objectsRawJSON: [],
      });
      return waitsForPromise(() => {
        return this.flushMicrotasks().then(() => {
          DatabaseStore.trigger(delta);
          expect(this.received).toEqual([delta]);
          unsub();
        });
      });
    });
  });
});
