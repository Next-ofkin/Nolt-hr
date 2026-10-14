import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  answersSchema,
  createField,
  validateAnswers,
} from "@nolt/form-schemas";
test("drafts preserve incomplete answers but submission validates the assigned questions", () => {
  const email = { ...createField("email", randomUUID()), required: true },
    date = createField("date", randomUUID()),
    choice = createField("select", randomUUID()),
    confirmation = { ...createField("checkbox", randomUUID()), required: true };
  const fields = [email, date, choice, confirmation];
  const answers = {
    [email.id]: "unfinished",
    [date.id]: "2026-02-30",
    [choice.id]: "Invented option",
    [confirmation.id]: false,
  };
  assert.equal(validateAnswers(fields, answers, false).issues.length, 0);
  assert.deepEqual(
    validateAnswers(fields, answers, true).issues.map((i) => i.fieldId),
    fields.map((f) => f.id),
  );
  assert.equal(
    validateAnswers(
      fields,
      {
        [email.id]: "qa@example.com",
        [date.id]: "2026-02-28",
        [choice.id]: "Option 1",
        [confirmation.id]: true,
      },
      true,
    ).issues.length,
    0,
  );
});
test("unknown fields, wrong answer types and inline signature payloads cannot be stored", () => {
  const text = createField("text", randomUUID()),
    signature = createField("signature", randomUUID()),
    file = createField("file", randomUUID());
  assert.equal(
    validateAnswers([text], { [randomUUID()]: "unknown" }, false).issues.length,
    1,
  );
  assert.equal(
    validateAnswers([text], { [text.id]: true }, false).issues.length,
    1,
  );
  for (const f of [signature, file]) {
    assert.equal(
      validateAnswers([f], { [f.id]: "data:image/png;base64,anything" }, false)
        .issues.length,
      1,
    );
    assert.equal(
      validateAnswers([{ ...f, required: true }], {}, true).issues.length,
      1,
    );
    assert.equal(validateAnswers([f], {}, true).issues.length, 0);
  }
  assert.equal(
    answersSchema.safeParse({ [text.id]: { actorId: randomUUID() } }).success,
    false,
  );
  assert.equal(
    answersSchema.safeParse({ [text.id]: "a".repeat(10001) }).success,
    false,
  );
});
test("numeric answers stay decimal strings and final validation rejects malformed values", () => {
  const field = createField("number", randomUUID());
  for (const v of ["12345678901234567890.123456789", "-12.50", "0"]) {
    const r = validateAnswers([field], { [field.id]: v }, true);
    assert.equal(r.issues.length, 0);
    assert.equal(r.answers[field.id], v);
  }
  for (const v of ["NaN", "Infinity", "1e999", "12x"])
    assert.equal(
      validateAnswers([field], { [field.id]: v }, true).issues.length,
      1,
    );
});
