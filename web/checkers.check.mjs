// node web/checkers.check.mjs: the Thai checkers rules and bot, checked on a few positions
import assert from "node:assert/strict";
import { startBoard, legalMoves, play, botMove } from "./checkers.js";

const sq = (r, c) => r * 8 + c;
const empty = () => new Array(64).fill(0);

// opening: 8 men a side, 7 first moves for you
const b0 = startBoard();
assert.equal(b0.filter((v) => v === 1).length, 8);
assert.equal(b0.filter((v) => v === -1).length, 8);
assert.equal(legalMoves(b0, 1).length, 7);

// a capture is compulsory, and men don't capture backwards
let b = empty();
b[sq(5, 2)] = 1; b[sq(4, 3)] = -1; b[sq(6, 5)] = 1; b[sq(6, 1)] = -1;
let ms = legalMoves(b, 1);
assert.deepEqual(ms.map((m) => [m.to, m.caps]), [[sq(3, 4), [sq(4, 3)]]]);

// captures chain on
b = empty();
b[sq(7, 0)] = 1; b[sq(6, 1)] = -1; b[sq(4, 3)] = -1;
ms = legalMoves(b, 1);
assert.equal(ms.length, 1);
assert.deepEqual(ms[0].caps, [sq(6, 1), sq(4, 3)]);
assert.equal(ms[0].to, sq(3, 4));

// a king flies, captures from afar, and lands right behind the piece
b = empty();
b[sq(7, 0)] = 2; b[sq(3, 4)] = -1;
ms = legalMoves(b, 1);
assert.deepEqual(ms.map((m) => m.to), [sq(2, 5)]);

// a man is crowned on the far row
b = empty();
b[sq(1, 2)] = 1;
assert.equal(play(b, legalMoves(b, 1)[0])[sq(0, 1)] || play(b, legalMoves(b, 1)[0])[sq(0, 3)], 2);

// the bot takes a free piece, and finds no move when it has none
b = empty();
b[sq(2, 3)] = -1; b[sq(3, 4)] = 1; b[sq(7, 0)] = 1;
for (const lv of ["easy", "hard"]) assert.deepEqual(botMove(b, -1, lv).caps, [sq(3, 4)]);
assert.equal(botMove(empty(), -1, "hard"), null);
const pick = botMove(b0, -1, "hard");
assert.ok(legalMoves(b0, -1).some((m) => m.from === pick.from && m.to === pick.to));
console.log("checkers ok");
