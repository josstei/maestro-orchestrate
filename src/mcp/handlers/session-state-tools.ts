import {
  archiveSession,
  createSession,
  getSessionStatus,
  updateSession,
} from '../session/session-lifecycle-service.js';
import { transitionPhase } from '../session/phase-transition-service.js';

const handleCreateSession = createSession;
const handleGetSessionStatus = getSessionStatus;
const handleTransitionPhase = transitionPhase;
const handleArchiveSession = archiveSession;
const handleUpdateSession = updateSession;

export {
  handleCreateSession,
  handleGetSessionStatus,
  handleTransitionPhase,
  handleArchiveSession,
  handleUpdateSession,
};
