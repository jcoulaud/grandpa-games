// Use the same solver offline, including when a game opens from a file.
function searchHint(createSolver, position) {
  return new Promise(resolve => {
    let worker, timer;
    const finish = result => {
      clearTimeout(timer);
      worker?.terminate();
      resolve(result);
    };
    const unknown = { unknown: true };
    const source = `const { solve } = (${createSolver.toString()})();
      onmessage = ({ data }) => {
        const result = solve(data, 60000);
        postMessage(result.unknown ? solve(data, 400000) : result);
      };`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      worker = new Worker(url);
      worker.onmessage = event => finish(event.data);
      worker.onerror = event => { event.preventDefault(); finish(unknown); };
      timer = setTimeout(() => finish(unknown), 5000);
      worker.postMessage(position);
    } catch {
      finish(unknown);
    } finally {
      URL.revokeObjectURL(url);
    }
  });
}
