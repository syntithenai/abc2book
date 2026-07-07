const handlers = {};

export function registerMergeCheckHandler(name, fn) {
  if (name) handlers[name] = fn;
}

export function unregisterMergeCheckHandler(name) {
  if (name) delete handlers[name];
}

export async function runMergeChecksNow() {
  let ran = false;
  const names = Object.keys(handlers);
  for (let i = 0; i < names.length; i += 1) {
    const fn = handlers[names[i]];
    if (typeof fn === 'function') {
      ran = true;
      await fn();
    }
  }
  return ran;
}
