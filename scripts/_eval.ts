import { evaluate } from './_search';

console.log(evaluate(JSON.parse(process.argv[2] ?? '{}')).text);
