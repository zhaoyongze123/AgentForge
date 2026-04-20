import test from "node:test";
import assert from "node:assert/strict";

import { isAppError } from "../src/core/errors/app-error.js";
import {
  acceptanceResultFixture,
  assignmentFixture,
  humanInterventionFixture,
  incidentFixture,
  knowledgeCandidateFixture,
  knowledgeEventFixture,
  knowledgeRecordFixture,
  planFixture,
  taskEventFixture,
  taskUnitFixture,
} from "../src/contracts/fixtures.js";
import {
  validateAcceptanceResult,
  validateAssignment,
  validateHumanIntervention,
  validateIncident,
  validateKnowledgeCandidate,
  validateKnowledgeEvent,
  validateKnowledgeRecord,
  validatePlan,
  validateTaskEvent,
  validateTaskUnit,
} from "../src/contracts/validator.js";

test("所有 contract fixture 都能通过校验", () => {
  assert.equal(
    validateTaskUnit(taskUnitFixture).taskId,
    taskUnitFixture.taskId,
  );
  assert.equal(
    validateAcceptanceResult(acceptanceResultFixture).status,
    acceptanceResultFixture.status,
  );
  assert.equal(
    validateKnowledgeRecord(knowledgeRecordFixture).knowledgeId,
    knowledgeRecordFixture.knowledgeId,
  );
  assert.equal(
    validateKnowledgeCandidate(knowledgeCandidateFixture).candidateId,
    knowledgeCandidateFixture.candidateId,
  );
  assert.equal(validatePlan(planFixture).planId, planFixture.planId);
  assert.equal(
    validateAssignment(assignmentFixture).assignmentId,
    assignmentFixture.assignmentId,
  );
  assert.equal(
    validateIncident(incidentFixture).incidentId,
    incidentFixture.incidentId,
  );
  assert.equal(
    validateHumanIntervention(humanInterventionFixture).interventionId,
    humanInterventionFixture.interventionId,
  );
  assert.equal(
    validateTaskEvent(taskEventFixture).eventId,
    taskEventFixture.eventId,
  );
  assert.equal(
    validateKnowledgeEvent(knowledgeEventFixture).eventId,
    knowledgeEventFixture.eventId,
  );
});

test("非法 TaskUnit 会返回结构化校验错误", () => {
  assert.throws(
    () =>
      validateTaskUnit({
        ...taskUnitFixture,
        title: "",
      }),
    (error: unknown) =>
      isAppError(error) &&
      error.code === "CONFIG_INVALID" &&
      Array.isArray(error.details?.issues),
  );
});
