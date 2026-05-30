import { jasmine } from './jasmine';

function exitSpec(code: number): void {
  const env: any = (typeof AppEnv !== 'undefined') ? AppEnv : null;
  if (env && typeof env.exit === 'function') {
    return env.exit(code);
  }
  if (typeof process !== 'undefined' && typeof process.exit === 'function') {
    return process.exit(code);
  }
  const remote = (typeof require !== 'undefined') ? require('@electron/remote') : null;
  if (remote && remote.app && typeof remote.app.exit === 'function') {
    return remote.app.exit(code);
  }
}

export default class TerminalReporter extends jasmine.Reporter {
  reportRunnerResults(runner) {
    const failedCount = runner.results().failedCount;
    const total = runner.results().totalCount;
    console.log(`\n[spec-runner] ${total - failedCount}/${total} passed, ${failedCount} failed.\n`);
    return exitSpec(failedCount > 0 ? 1 : 0);
  }
}
