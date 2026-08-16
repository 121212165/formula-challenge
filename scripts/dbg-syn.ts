import { normalizeWithSynonyms } from "../src/lib/subject-scoring";
console.log("a:", JSON.stringify(normalizeWithSynonyms("清热燥湿")));
console.log("b:", JSON.stringify(normalizeWithSynonyms("清热除湿")));
console.log("c:", JSON.stringify(normalizeWithSynonyms("泻火解毒")));
console.log("d:", JSON.stringify(normalizeWithSynonyms("降火解毒")));
