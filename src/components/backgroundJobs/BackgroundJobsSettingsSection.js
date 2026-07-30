import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Badge, Nav, Tab } from 'react-bootstrap'
import FormFieldHelp from '../FormFieldHelp'
import { SETTINGS_FIELD_HELP } from '../../formFieldHelpText'
import {
  getBackgroundJobTabCounts,
  getBackgroundJobTabCountsKey,
  getFirstActiveBackgroundJobTab,
} from '../../backgroundJobsCounts'
import useBulkBackgroundResearchQueue from '../../useBulkBackgroundResearchQueue'
import useBulkComposerDiscoveryQueue from '../../useBulkComposerDiscoveryQueue'
import useMediaCacheQueue from '../../useMediaCacheQueue'
import useStemCreateQueue from '../../useStemCreateQueue'
import * as bulkBackgroundResearchQueue from '../../bulkBackgroundResearchQueue'
import * as bulkComposerDiscoveryQueue from '../../bulkComposerDiscoveryQueue'
import * as mediaCacheQueue from '../../mediaCacheQueue'
import * as stemCreateQueue from '../../stemCreateQueue'
import { subscribePlaybackRegionScanJobs } from '../../playbackRegionScanJobs'
import { subscribeMediaAnalysisJobs } from '../../mediaAnalysisJobs'
import { subscribeFileOcrJobs } from '../../fileOcrJobs'
import { subscribeBulkCheckSession } from '../../bulkCheckSessionStore'
import { subscribeBulkCheckRunner } from '../../bulkCheckRunner'
import { subscribeImportReviewEnrichment } from '../../importReviewEnrichmentBridge'
import { subscribeLongRunningJobs } from '../../longRunningJobRegistry'
import { subscribeStemAnalysisJob, getStemAnalysisJobRevision } from '../../stemAnalysisJobStore'
import { subscribe as subscribeAudioGenerationJobs } from '../../audioGenerationJobStore'
import * as tuneFieldLookupQueue from '../../tuneFieldLookupQueue'
import JobQueueTabPanel from './JobQueueTabPanel'
import ComposerCandidateQuickPick from '../ComposerCandidateQuickPick'
import { fifoStatusVariant } from './jobQueueUtils'
import PlaybackScanTabPanel from './PlaybackScanTabPanel'
import MediaAnalysisTabPanel from './MediaAnalysisTabPanel'
import FileOcrTabPanel from './FileOcrTabPanel'
import BulkCheckTabPanel from './BulkCheckTabPanel'
import ImportEnrichmentTabPanel from './ImportEnrichmentTabPanel'
import StemCreateTabPanel from './StemCreateTabPanel'
import AudioGenerationTabPanel from './AudioGenerationTabPanel'
import ActiveSearchesTabPanel from './ActiveSearchesTabPanel'

const TAB_RESEARCH = 'research'
const TAB_COMPOSER_DISCOVERY = 'composer-discovery'
const TAB_MEDIA_CACHE = 'media-cache'
const TAB_STEM_CREATE = 'stem-create'
const TAB_AUDIO_GENERATION = 'audio-generation'
const TAB_PLAYBACK_SCANS = 'playback-scans'
const TAB_MEDIA_ANALYSIS = 'media-analysis'
const TAB_FILE_OCR = 'file-ocr'
const TAB_BULK_CHECK = 'bulk-check'
const TAB_IMPORT_ENRICHMENT = 'import-enrichment'
const TAB_ACTIVE_SEARCHES = 'active-searches'

function subscribeAllBackgroundJobStores(listener) {
  const unsubs = [
    bulkBackgroundResearchQueue.subscribe(listener),
    bulkComposerDiscoveryQueue.subscribe(listener),
    mediaCacheQueue.subscribe(listener),
    stemCreateQueue.subscribe(listener),
    subscribePlaybackRegionScanJobs(listener),
    subscribeMediaAnalysisJobs(listener),
    subscribeFileOcrJobs(listener),
    subscribeBulkCheckSession(listener),
    subscribeBulkCheckRunner(listener),
    subscribeImportReviewEnrichment(listener),
    subscribeLongRunningJobs(listener),
    subscribeStemAnalysisJob(listener),
    subscribeAudioGenerationJobs(listener),
    tuneFieldLookupQueue.subscribe(listener),
  ]
  return function unsubscribeAll() {
    unsubs.forEach(function(unsub) { unsub() })
  }
}

function renderTabTitle(label, count) {
  return (
    <span className="settings-background-jobs-tab-title">
      {label}
      {count > 0 ? (
        <Badge bg="danger" className="settings-background-jobs-tab-badge">{count}</Badge>
      ) : null}
    </span>
  )
}

function researchStatusLabel(job) {
  if (job.status === 'skipped' && job.skipReason === 'has-background') {
    return 'skipped (has background)'
  }
  if (job.status === 'skipped' && job.skipReason === 'no-title') {
    return 'skipped (no title)'
  }
  return job.status
}

function stemCreateStatusLabel(job) {
  if (job.status === 'skipped' && job.skipReason === 'no-link') {
    return 'skipped (no media link)'
  }
  return job.status
}

function composerDiscoveryStatusLabel(job) {
  if (job.status === 'awaiting') {
    return 'awaiting review'
  }
  if (job.status === 'skipped' && job.skipReason === 'has-composer') {
    return 'skipped (has artist)'
  }
  if (job.status === 'skipped' && job.skipReason === 'no-title') {
    return 'skipped (no title)'
  }
  return job.status
}

export default function BackgroundJobsSettingsSection({ tunes, mediaController, initialJobsTab }) {
  const [activeTab, setActiveTab] = useState(function() {
    if (initialJobsTab) return initialJobsTab
    return getFirstActiveBackgroundJobTab(mediaController) || TAB_RESEARCH
  })

  useEffect(function() {
    if (initialJobsTab) setActiveTab(initialJobsTab)
  }, [initialJobsTab])
  const researchQueue = useBulkBackgroundResearchQueue()
  const composerDiscoveryQueue = useBulkComposerDiscoveryQueue()
  const mediaCacheQueueHook = useMediaCacheQueue()
  const stemCreateQueueHook = useStemCreateQueue()

  const tabCountsRevision = useSyncExternalStore(
    subscribeAllBackgroundJobStores,
    function() {
      return getBackgroundJobTabCountsKey(mediaController) + '|' + getStemAnalysisJobRevision()
    },
    function() {
      return getBackgroundJobTabCountsKey(null)
    }
  )

  const tabCounts = useMemo(function() {
    return getBackgroundJobTabCounts(mediaController)
  }, [
    tabCountsRevision,
    mediaController,
    mediaController && mediaController.stemSeparationActive,
    mediaController && mediaController.stemAnalysisProgress,
  ])

  const researchErrors = useMemo(function() {
    return researchQueue.state.jobs.some(function(job) { return job.status === 'error' })
  }, [researchQueue.state.jobs])

  const stemCreateErrors = useMemo(function() {
    return stemCreateQueueHook.state.jobs.some(function(job) { return job.status === 'error' })
  }, [stemCreateQueueHook.state.jobs])

  const composerDiscoveryErrors = useMemo(function() {
    return composerDiscoveryQueue.state.jobs.some(function(job) { return job.status === 'error' })
  }, [composerDiscoveryQueue.state.jobs])

  const composerDiscoveryCurrentJob = composerDiscoveryQueue.state.jobs.find(function(job) {
    return job.id === composerDiscoveryQueue.state.currentJobId
  })

  const researchCurrentJob = researchQueue.state.jobs.find(function(job) {
    return job.id === researchQueue.state.currentJobId
  })

  const stemCreateCurrentJob = stemCreateQueueHook.state.jobs.find(function(job) {
    return job.id === stemCreateQueueHook.state.currentJobId
  })

  return (
    <div className="app-surface-panel App-settings-section settings-background-jobs-section">
      <h2>
        Background jobs
        <FormFieldHelp
          title={SETTINGS_FIELD_HELP.backgroundJobs.title}
          body={SETTINGS_FIELD_HELP.backgroundJobs.body}
        />
      </h2>
      <p className="app-text-muted settings-background-jobs-intro">
        Monitor and manage background work from here. Red badges show incomplete jobs per tab.
      </p>

      <Tab.Container activeKey={activeTab} onSelect={function(key) {
        if (key) setActiveTab(key)
      }}>
        <Nav variant="tabs" className="settings-background-jobs-tabs">
          <Nav.Item>
            <Nav.Link eventKey={TAB_RESEARCH}>
              {renderTabTitle('Background research', tabCounts.research)}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey={TAB_COMPOSER_DISCOVERY}>
              {renderTabTitle('Artist discovery', tabCounts.composerDiscovery)}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey={TAB_MEDIA_CACHE}>
              {renderTabTitle('Media cache', tabCounts.mediaCache)}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey={TAB_STEM_CREATE}>
              {renderTabTitle('Stems', tabCounts.stemCreate)}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey={TAB_AUDIO_GENERATION}>
              {renderTabTitle('Audio generation', tabCounts.audioGeneration)}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey={TAB_PLAYBACK_SCANS}>
              {renderTabTitle('Playback scans', tabCounts.playbackScans)}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey={TAB_BULK_CHECK}>
              {renderTabTitle('Bulk check', tabCounts.bulkCheck)}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey={TAB_MEDIA_ANALYSIS}>
              {renderTabTitle('Media analysis', tabCounts.mediaAnalysis)}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey={TAB_FILE_OCR}>
              {renderTabTitle('File OCR', tabCounts.fileOcr)}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey={TAB_IMPORT_ENRICHMENT}>
              {renderTabTitle('Import enrichment', tabCounts.importEnrichment)}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey={TAB_ACTIVE_SEARCHES}>
              {renderTabTitle('Active searches', tabCounts.activeSearches)}
            </Nav.Link>
          </Nav.Item>
        </Nav>

        <Tab.Content className="settings-background-jobs-tab-content">
          <Tab.Pane eventKey={TAB_RESEARCH}>
            <p className="text-muted settings-background-jobs-tab-note">
              Writes background notes on each tune automatically. Safe to leave running in the background.
            </p>
            <JobQueueTabPanel
              jobs={researchQueue.state.jobs}
              running={researchQueue.state.running}
              paused={researchQueue.state.paused}
              overallProgress={researchQueue.overallProgress}
              finishedCount={researchQueue.finishedCount}
              totalCount={researchQueue.totalCount}
              currentJobMessage={researchCurrentJob && researchCurrentJob.message ? researchCurrentJob.message : ''}
              progressHasErrors={researchErrors}
              onStart={researchQueue.start}
              onStop={researchQueue.stop}
              onClearFinished={researchQueue.clearFinished}
              onCancelAll={researchQueue.cancelAll}
              onCancelJob={researchQueue.cancelJob}
              renderJobTitle={function(job) {
                return <strong>{job.tuneName || job.title || 'Untitled'}</strong>
              }}
              renderJobMeta={function(job, QueueBadge) {
                return (
                  <>
                    <QueueBadge variant={fifoStatusVariant(job.status)}>
                      {researchStatusLabel(job)}
                    </QueueBadge>
                    {job.status === 'running' && job.progress > 0 ? (
                      <QueueBadge variant="info">{job.progress + '%'}</QueueBadge>
                    ) : null}
                  </>
                )
              }}
              renderJobExtra={function(job) {
                return (
                  <>
                    {job.message ? (
                      <div className="text-muted background-jobs-queue-item-message">{job.message}</div>
                    ) : null}
                    {job.error ? (
                      <div className="text-danger background-jobs-queue-item-error">{job.error}</div>
                    ) : null}
                  </>
                )
              }}
            />
          </Tab.Pane>

          <Tab.Pane eventKey={TAB_COMPOSER_DISCOVERY}>
            <p className="text-muted settings-background-jobs-tab-note">
              Discovers recording artists for selected tunes. Review each result and choose which artist to save.
            </p>
            <JobQueueTabPanel
              jobs={composerDiscoveryQueue.state.jobs}
              running={composerDiscoveryQueue.state.running}
              paused={composerDiscoveryQueue.state.paused}
              overallProgress={composerDiscoveryQueue.overallProgress}
              finishedCount={composerDiscoveryQueue.finishedCount}
              totalCount={composerDiscoveryQueue.totalCount}
              currentJobMessage={composerDiscoveryCurrentJob && composerDiscoveryCurrentJob.message
                ? composerDiscoveryCurrentJob.message
                : ''}
              progressHasErrors={composerDiscoveryErrors}
              onStart={composerDiscoveryQueue.start}
              onStop={composerDiscoveryQueue.stop}
              onClearFinished={composerDiscoveryQueue.clearFinished}
              onCancelAll={composerDiscoveryQueue.cancelAll}
              onCancelJob={composerDiscoveryQueue.cancelJob}
              renderJobTitle={function(job) {
                return <strong>{job.tuneName || job.title || 'Untitled'}</strong>
              }}
              renderJobMeta={function(job, QueueBadge) {
                return (
                  <>
                    <QueueBadge variant={fifoStatusVariant(job.status)}>
                      {composerDiscoveryStatusLabel(job)}
                    </QueueBadge>
                    {job.discoveredComposer ? (
                      <QueueBadge variant="success">{job.discoveredComposer}</QueueBadge>
                    ) : null}
                    {job.status === 'running' && job.progress > 0 ? (
                      <QueueBadge variant="info">{job.progress + '%'}</QueueBadge>
                    ) : null}
                  </>
                )
              }}
              renderJobExtra={function(job) {
                return (
                  <>
                    {job.message ? (
                      <div className="text-muted background-jobs-queue-item-message">{job.message}</div>
                    ) : null}
                    {job.status === 'awaiting' && Array.isArray(job.composerCandidates) && job.composerCandidates.length > 0 ? (
                      <ComposerCandidateQuickPick
                        className="mt-2"
                        candidates={job.composerCandidates}
                        placeholder="Choose artist to save…"
                        onSelect={function(artist) {
                          composerDiscoveryQueue.applyComposerChoice(job.id, artist)
                        }}
                      />
                    ) : null}
                    {job.error ? (
                      <div className="text-danger background-jobs-queue-item-error">{job.error}</div>
                    ) : null}
                  </>
                )
              }}
            />
          </Tab.Pane>

          <Tab.Pane eventKey={TAB_MEDIA_CACHE}>
            <JobQueueTabPanel
              jobs={mediaCacheQueueHook.state.jobs}
              running={mediaCacheQueueHook.state.running}
              paused={mediaCacheQueueHook.state.paused}
              onStart={mediaCacheQueueHook.start}
              onStop={mediaCacheQueueHook.stop}
              onClearFinished={mediaCacheQueueHook.clearFinished}
              onCancelAll={mediaCacheQueueHook.cancelAll}
              onCancelJob={mediaCacheQueueHook.cancelJob}
              renderJobTitle={function(job) {
                return (
                  <>
                    <strong>{job.tuneName || 'Untitled'}</strong>
                    {job.linkTitle ? <span className="text-muted"> — {job.linkTitle}</span> : null}
                  </>
                )
              }}
              renderJobMeta={function(job, QueueBadge) {
                return (
                  <>
                    <QueueBadge variant={job.type === 'download' ? 'info' : 'cache'}>
                      {job.type === 'download' ? 'Download' : 'Cache'}
                    </QueueBadge>
                    {job.srcType === 'youtube' ? (
                      <QueueBadge variant="youtube">YouTube</QueueBadge>
                    ) : null}
                    <QueueBadge variant={fifoStatusVariant(job.status)}>{job.status}</QueueBadge>
                  </>
                )
              }}
              renderJobExtra={function(job) {
                return job.error ? (
                  <div className="text-danger background-jobs-queue-item-error">{job.error}</div>
                ) : null
              }}
            />
          </Tab.Pane>

          <Tab.Pane eventKey={TAB_STEM_CREATE}>
            <p className="text-muted settings-background-jobs-tab-note">
              Batch stem caching plus live separation for the current track. Both run automatically unless cancelled.
            </p>
            <StemCreateTabPanel
              mediaController={mediaController}
              queueProps={{
                jobs: stemCreateQueueHook.state.jobs,
                running: stemCreateQueueHook.state.running,
                paused: stemCreateQueueHook.state.paused,
                overallProgress: stemCreateQueueHook.overallProgress,
                finishedCount: stemCreateQueueHook.finishedCount,
                totalCount: stemCreateQueueHook.totalCount,
                currentJobMessage: stemCreateCurrentJob && stemCreateCurrentJob.message ? stemCreateCurrentJob.message : '',
                progressHasErrors: stemCreateErrors,
                onStart: stemCreateQueueHook.start,
                onStop: stemCreateQueueHook.stop,
                onClearFinished: stemCreateQueueHook.clearFinished,
                onCancelAll: stemCreateQueueHook.cancelAll,
                onCancelJob: stemCreateQueueHook.cancelJob,
                renderJobTitle: function(job) {
                  return (
                    <>
                      <strong>{job.tuneName || 'Untitled'}</strong>
                      {job.linkTitle ? <span className="text-muted"> — {job.linkTitle}</span> : null}
                    </>
                  )
                },
                renderJobMeta: function(job, QueueBadge) {
                  return (
                    <>
                      <QueueBadge variant={fifoStatusVariant(job.status)}>
                        {stemCreateStatusLabel(job)}
                      </QueueBadge>
                      {job.srcType === 'youtube' ? (
                        <QueueBadge variant="info">YouTube</QueueBadge>
                      ) : null}
                      {job.status === 'running' && job.progress > 0 ? (
                        <QueueBadge variant="info">{job.progress + '%'}</QueueBadge>
                      ) : null}
                    </>
                  )
                },
                renderJobExtra: function(job) {
                  return (
                    <>
                      {job.message ? (
                        <div className="text-muted background-jobs-queue-item-message">{job.message}</div>
                      ) : null}
                      {job.error ? (
                        <div className="text-danger background-jobs-queue-item-error">{job.error}</div>
                      ) : null}
                    </>
                  )
                },
              }}
            />
          </Tab.Pane>

          <Tab.Pane eventKey={TAB_AUDIO_GENERATION}>
            <p className="text-muted settings-background-jobs-tab-note">
              Practice tracks and linked-media cover variants run in the background after you start them from a tune.
            </p>
            <AudioGenerationTabPanel />
          </Tab.Pane>

          <Tab.Pane eventKey={TAB_PLAYBACK_SCANS}>
            <p className="text-muted settings-background-jobs-tab-note">
              Detects intro/outro speech and updates Start At / End At automatically. Safe to leave running in the background.
            </p>
            <PlaybackScanTabPanel tunes={tunes} />
          </Tab.Pane>

          <Tab.Pane eventKey={TAB_BULK_CHECK}>
            <p className="text-muted settings-background-jobs-tab-note">
              Validates completeness, ABC, and link playback in the background. Reopen bulk check when you want to review findings.
            </p>
            <BulkCheckTabPanel />
          </Tab.Pane>

          <Tab.Pane eventKey={TAB_MEDIA_ANALYSIS}>
            <p className="text-muted settings-background-jobs-tab-note">
              Transcribes linked audio; you choose what to merge into the tune when analysis finishes.
            </p>
            <MediaAnalysisTabPanel tunes={tunes} />
          </Tab.Pane>

          <Tab.Pane eventKey={TAB_FILE_OCR}>
            <p className="text-muted settings-background-jobs-tab-note">
              Reads attached sheet images and chord charts; you choose what to merge when OCR finishes.
            </p>
            <FileOcrTabPanel />
          </Tab.Pane>

          <Tab.Pane eventKey={TAB_IMPORT_ENRICHMENT}>
            <p className="text-muted settings-background-jobs-tab-note">
              Enriches import candidates during import review; you confirm what to keep before merging.
            </p>
            <ImportEnrichmentTabPanel />
          </Tab.Pane>

          <Tab.Pane eventKey={TAB_ACTIVE_SEARCHES}>
            <ActiveSearchesTabPanel />
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </div>
  )
}
