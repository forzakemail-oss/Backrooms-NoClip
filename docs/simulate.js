const TRIALS = 100;
let escapes = 0;
let loops = 0;

for (let i = 0; i < TRIALS; i++) {
  let escaped = false;
  for (let level = 1; level <= 5; level++) {
    loops += 1;
    if (Math.random() < 0.00001) {
      escaped = true;
      break;
    }
  }
  if (escaped) escapes += 1;
}

console.log(`Ran ${TRIALS} escape simulations.`);
console.log(`Escapes to reality: ${escapes}`);
console.log(`Overall chance observed: ${(escapes / TRIALS * 100).toFixed(4)}%`);
console.log(`Simulated transition checks: ${loops}`);
