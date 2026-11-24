// 簡單的 worker_threads 池：runAll(task, argsList) 平行跑完，依序回傳結果
const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

function createPool(size) {
  size = size || Math.max(1, os.cpus().length - 1);
  const workers = [];
  const idle = [];
  const queue = [];
  const pending = new Map();
  let nextId = 1;

  function dispatch() {
    while (idle.length && queue.length) {
      const w = idle.pop(), job = queue.shift();
      pending.set(job.id, { job, w });
      w.postMessage({ id: job.id, task: job.task, args: job.args });
    }
  }
  for (let i = 0; i < size; i++) {
    const w = new Worker(path.join(__dirname, 'worker.js'));
    w.on('message', (m) => {
      const p = pending.get(m.id); pending.delete(m.id);
      idle.push(w);
      if (m.error) p.job.reject(new Error(m.error)); else p.job.resolve(m.result);
      dispatch();
    });
    w.on('error', (e) => { for (const [, p] of pending) p.job.reject(e); });
    workers.push(w); idle.push(w);
  }
  function run(task, args) {
    return new Promise((resolve, reject) => { queue.push({ id: nextId++, task, args, resolve, reject }); dispatch(); });
  }
  return {
    size,
    run,
    runAll: (task, argsList) => Promise.all(argsList.map((a) => run(task, a))),
    close: () => Promise.all(workers.map((w) => w.terminate())),
  };
}
module.exports = { createPool };
