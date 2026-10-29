// Offline Sync Engine Features (Fase P5)

export {
	type ClockSkewInfo,
	calculateOffsetFromHeader,
	formatRelative,
	formatWib,
	getClockSkewInfo,
	getCorrectedIsoString,
	getCorrectedNow,
	getServerTimeOffset,
	initServerTimeOffset,
	isClockSkewSignificant,
	isTimestampWithinAcceptableWindow,
	type OccurredAtValidationResult,
	resetServerTimeOffset,
	SERVER_TIME_OFFSET_STORAGE_KEY,
	SERVER_TIME_SYNCED_EVENT,
	type SetServerTimeOffsetOptions,
	SIGNIFICANT_CLOCK_SKEW_THRESHOLD_MS,
	setServerTimeOffset,
	TRANSACTION_MAX_FUTURE_MINUTES,
	TRANSACTION_MAX_PAST_DAYS,
	validateOccurredAt,
} from "@/lib/time";
export {
	DiagnosticLogDialog,
	type DiagnosticLogDialogProps,
} from "./components/DiagnosticLogDialog";
export {
	DiscardConfirmDialog,
	type DiscardConfirmDialogProps,
} from "./components/DiscardConfirmDialog";
export {
	IosInstallGuideModal,
	type IosInstallGuideModalProps,
} from "./components/IosInstallGuideModal";
export {
	IosQueueWarningBanner,
	type IosQueueWarningBannerProps,
} from "./components/IosQueueWarningBanner";
export {
	OutboxItemCard,
	type OutboxItemCardProps,
} from "./components/OutboxItemCard";
export {
	type OutboxQueueTab,
	OutboxQueueView,
	type OutboxQueueViewProps,
} from "./components/OutboxQueueView";
export {
	type UseDiagnosticLogsOptions,
	useDiagnosticLogs,
} from "./hooks/useDiagnosticLogs";
export {
	AGING_WARNING_COOLDOWN_MS,
	AGING_WARNING_DISMISSED_KEY,
	DANGER_WARNING_COOLDOWN_MS,
	type UseOutboxAgingWarningOptions,
	type UseOutboxAgingWarningResult,
	useOutboxAgingWarning,
} from "./hooks/useOutboxAgingWarning";
export {
	type EnrichedOutboxItem,
	type OutboxQueueCounters,
	type UseOutboxQueueOptions,
	type UseOutboxQueueResult,
	useOutboxQueue,
} from "./hooks/useOutboxQueue";
export {
	type UseServerTimeOffsetResult,
	useServerTimeOffset,
} from "./hooks/useServerTimeOffset";
export {
	type UseSyncEngineOptions,
	type UseSyncEngineResult,
	useSyncEngine,
} from "./hooks/useSyncEngine";
export {
	type UseSyncSchedulerResult,
	useSyncScheduler,
} from "./hooks/useSyncScheduler";
export {
	type BackoffOptions,
	calculateBackoffDelay,
	calculateNextAttemptAt,
	DEFAULT_BACKOFF_CONFIG,
	parseRetryAfterHeader,
} from "./lib/backoff";
export {
	type AddDiagnosticLogOptions,
	copyLogsToClipboard,
	DEFAULT_DIAGNOSTIC_LOG_CAP,
	DIAGNOSTIC_CATEGORIES,
	DIAGNOSTIC_LOG_UPDATED_EVENT,
	type DiagnosticCategory,
	downloadLogsFile,
	formatDiagnosticTimestamp,
	recordDiagnosticLog,
} from "./lib/diagnostics";
export {
	calculateOutboxAging,
	IOS_EVICTION_MAX_DAYS,
	type OutboxAgingInfo,
	type OutboxAgingOptions,
	type OutboxWarningLevel,
	STALE_OUTBOX_DANGER_HOURS,
	STALE_OUTBOX_WARNING_HOURS,
} from "./lib/outboxAging";
export {
	classifySyncResponse,
	type SyncAction,
	type SyncResponseClassification,
} from "./lib/responseClassifier";
export {
	DEFAULT_SYNC_CONCURRENCY,
	groupOutboxItemsByItem,
	type ItemQueueResult,
	isEligibleForSync,
	isSyncEngineRunning,
	processItemOutboxQueue,
	runSyncEngine,
	SYNC_ENGINE_EVENT,
	type SyncEngineOptions,
	type SyncEngineResult,
} from "./lib/syncEngine";
export {
	SYNC_PAUSE_EVENT,
	SyncPauseController,
	type SyncPauseState,
	syncPauseController,
} from "./lib/syncPauseController";
export {
	DEFAULT_SCHEDULER_OPTIONS,
	SYNC_TRIGGERED_EVENT,
	SyncScheduler,
	type SyncSchedulerOptions,
	type SyncTriggerReason,
	syncScheduler,
} from "./lib/syncScheduler";
export {
	DEFAULT_HEARTBEAT_INTERVAL_MS,
	DEFAULT_TAB_LOCK_TIMEOUT_MS,
	FALLBACK_STORAGE_LOCK_KEY_PREFIX,
	type FallbackLockRecord,
	getTabId,
	isStorageLockHeld,
	isWebLocksSupported,
	readFallbackLockRecord,
	releaseFallbackLock,
	SYNC_TAB_LOCK_NAME,
	type TabLockOptions,
	type TabLockResult,
	withTabLock,
} from "./lib/tabLock";
