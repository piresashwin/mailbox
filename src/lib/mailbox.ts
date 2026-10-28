/** Compatibility re-exports — prefer `#/server/*` for new code. */
export {
  listProviderCatalogFn as listProviderCatalog,
  listConnections,
  beginConnect,
  disconnectAccount,
  runSync,
} from '#/server/connections'

export {
  listOpenItems,
  listDoneItems,
  markDone,
  snoozeItem,
  changeCategory,
  type OpenItem,
} from '#/server/tracker'

export { getSettings, updateSettings } from '#/server/settings'

export {
  summarizeThread,
  listThreadAttachments,
  draftReplyWithAi,
  sendReply,
  type ThreadAttachment,
} from '#/server/thread'

export {
  listCommitments,
  listCommitmentsForTracker,
  updateCommitment,
  confirmSuggestedClears,
  dismissSuggestedClears,
  getMorningBrief,
  type CommitmentItem,
} from '#/server/commitments'
