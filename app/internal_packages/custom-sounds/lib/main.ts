import { SoundRegistry } from 'mailspring-exports';

export function activate() {
  SoundRegistry.register('send', 'actunamail://custom-sounds/CUSTOM_UI_Send_v1.ogg');
  SoundRegistry.register('confirm', 'actunamail://custom-sounds/CUSTOM_UI_Confirm_v1.ogg');
  SoundRegistry.register('hit-send', 'actunamail://custom-sounds/CUSTOM_UI_HitSend_v1.ogg');
  SoundRegistry.register('new-mail', 'actunamail://custom-sounds/CUSTOM_UI_NewMail_v1.ogg');
}

export function deactivate() {
  SoundRegistry.unregister(['send', 'confirm', 'hit-send', 'new-mail']);
}
