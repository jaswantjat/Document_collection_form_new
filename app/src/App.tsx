import { lazy, Suspense, useState, useEffect, useEffectEvent, useRef } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { normalizeFormData, useFormState } from '@/hooks/useFormState';
import { useBeforeUnloadSave } from '@/hooks/useBeforeUnloadSave';
import { useLocalStorageBackup, readLocalBackup, clearLocalBackup } from '@/hooks/useLocalStorageBackup';
import { readIndexedDBBackup } from '@/hooks/useIndexedDBBackup';
import { fetchProject } from '@/services/api';
import { buildProjectUrl } from '@/lib/dashboardHelpers';
import { PhoneSection } from '@/sections/PhoneSection';
import { PropertyDocsSection } from '@/sections/PropertyDocsSection';
import { ErrorSection } from '@/sections/ErrorSection';
import { LoadingSection } from '@/sections/LoadingSection';
import { ChunkErrorBoundary } from '@/components/ChunkErrorBoundary';
import { isIdentityDocumentComplete } from '@/lib/identityDocument';
import { hasEnergyCertificateDecision } from '@/lib/energyCertificateFlow';
import { getLocationInfo } from '@/lib/provinceMapping';
import { mergeProjectWithDeviceBackup } from '@/lib/projectBackupMerge';
import { prefetchCustomerSection } from '@/lib/sectionPrefetch';
// SuccessSection is imported statically (not lazy) — it's tiny and must render
// instantly after submit completes, avoiding a Suspense/LoadingSection flash.
import { SuccessSection } from '@/sections/SuccessSection';
import { FlowProgressBar } from '@/components/FlowProgressBar';
import type { FormData, ProjectData, RepresentationData, Section } from '@/types';
import './App.css';

// React.lazy needs a maximally wide component constraint here so inference keeps
// each imported section's real props instead of collapsing them to `never`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  return lazy(async () => {
    try {
      return await factory();
    } catch {
      await wait(1000);
    }

    try {
      return await factory();
    } catch {
      await wait(2000);
    }

    try {
      return await factory();
    } catch {
      await wait(3000);
    }

    try {
      return await factory();
    } catch {
      await wait(4000);
    }

    return factory();
  });
}

const ProvinceSelectionSection = lazyWithRetry(() => import('@/sections/ProvinceSelectionSection').then((module) => ({ default: module.ProvinceSelectionSection })));
const RepresentationSection = lazyWithRetry(() => import('@/sections/RepresentationSection').then((module) => ({ default: module.RepresentationSection })));
const EnergyCertificateSection = lazyWithRetry(() => import('@/sections/EnergyCertificateSection').then((module) => ({ default: module.EnergyCertificateSection })));
const ReviewSection = lazyWithRetry(() => import('@/sections/ReviewSection').then((module) => ({ default: module.ReviewSection })));
const Dashboard = lazyWithRetry(() => import('@/pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const DashboardLogin = lazyWithRetry(() => import('@/pages/DashboardLogin').then((module) => ({ default: module.DashboardLogin })));

// ── Dashboard wrapper (handles login gate) ────────────────────────────────────
function DashboardApp() {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('dashboard_token')
  );

  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<LoadingSection />}>
        {!token ? (
          <DashboardLogin onLogin={setToken} />
        ) : (
          <Dashboard token={token} onLogout={() => setToken(null)} />
        )}
      </Suspense>
    </ChunkErrorBoundary>
  );
}

// ── Helpers for smart section routing ─────────────────────────────────────────
function hasPropertyDocsDone(formData: FormData | null): boolean {
  if (!formData) return false;
  return !!(
    isIdentityDocumentComplete(formData.dni)
    && (formData.ibi?.photo || formData.ibi?.pages?.length)
    && formData.electricityBill?.pages?.length
  );
}

function hasRepresentationDone(formData: FormData | null, location: string | null): boolean {
  if (!formData || !location) return false;
  if (location === 'other') return true;
  const rep = formData.representation;
  if (!rep) return false;
  if (location === 'cataluna') {
    return !!(rep.ivaCertificateSignature && rep.generalitatSignature && rep.representacioSignature);
  }
  if (location === 'madrid' || location === 'valencia') {
    return !!(rep.ivaCertificateEsSignature && rep.poderRepresentacioSignature);
  }
  return false;
}

function hasExistingRepresentationFlow(formData: FormData | null): boolean {
  if (!formData) return false;
  const location = formData.location ?? formData.representation?.location ?? null;
  return hasRepresentationDone(formData, location);
}

function getInitialSection(
  project: ProjectData | null,
  urlCode: string | null
): Section | 'phone' {
  if (!project || !urlCode) return urlCode ? 'property-docs' : 'phone';

  const fd = project.formData;
  const location = fd?.location ?? fd?.representation?.location ?? null;
  const followUpDocumentFlow = hasExistingRepresentationFlow(fd);
  const hasEnergyDecision = hasEnergyCertificateDecision(fd?.energyCertificate);

  // Try to restore the last saved section before recomputing from scratch.
  const saved = readSavedSection(urlCode);
  if (saved) {
    // If the user was on representation but it's now done, advance past it.
    if (saved === 'representation' && hasRepresentationDone(fd, location)) {
      return hasEnergyDecision ? 'review' : 'energy-certificate';
    }
    // Advanced sections (energy-certificate, review) must always be restored even when
    // followUpDocumentFlow is true — the user was legitimately past property-docs.
    if (saved === 'energy-certificate' || saved === 'review') {
      return saved;
    }
    // For earlier sections only restore if not in a follow-up flow that needs property docs.
    if (!followUpDocumentFlow) {
      if (saved !== 'representation' || (!!location && location !== 'other')) {
        return saved;
      }
    }
  }

  if (followUpDocumentFlow) return 'review';
  if (hasRepresentationDone(fd, location)) return hasEnergyDecision ? 'review' : 'energy-certificate';
  if (location === 'other') return hasEnergyDecision ? 'review' : 'energy-certificate';
  if (location) return 'representation';
  if (hasPropertyDocsDone(fd)) return 'province-selection';
  return 'property-docs';
}

function getLikelyNextSection(
  currentSection: Section | 'phone',
  formData: FormData,
  followUpDocumentFlow: boolean
): Section | null {
  const location = formData.location ?? formData.representation?.location ?? null;
  switch (currentSection) {
    case 'property-docs':
      if (followUpDocumentFlow) {
        return hasEnergyCertificateDecision(formData.energyCertificate)
          ? 'review'
          : 'energy-certificate';
      }
      if (!location) return 'province-selection';
      return location === 'other'
        ? (
          hasEnergyCertificateDecision(formData.energyCertificate)
            ? 'review'
            : 'energy-certificate'
        )
        : 'representation';
    case 'province-selection':
      return location === 'other'
        ? (
          hasEnergyCertificateDecision(formData.energyCertificate)
            ? 'review'
            : 'energy-certificate'
        )
        : 'representation';
    case 'representation':
      return hasEnergyCertificateDecision(formData.energyCertificate)
        ? 'review'
        : 'energy-certificate';
    case 'energy-certificate':
      return 'review';
    default:
      return null;
  }
}

// ── Section persistence: restore current section on page reload ───────────────
const VALID_SECTIONS: (Section | 'phone')[] = [
  'phone', 'property-docs', 'province-selection',
  'representation', 'energy-certificate', 'review',
];
function saveSectionToStorage(code: string, section: Section | 'phone') {
  if (section === 'phone' || section === 'success') return;
  try { localStorage.setItem(`eltex_section_${code}`, section); } catch { /* ignore */ }
}
function readSavedSection(code: string): Section | null {
  try {
    const v = localStorage.getItem(`eltex_section_${code}`);
    return VALID_SECTIONS.includes(v as Section) ? (v as Section) : null;
  } catch { return null; }
}

function normalizeLoadedProject(project: ProjectData): ProjectData {
  return {
    ...project,
    formData: normalizeFormData(project.formData ?? null),
  };
}

// ── Main Form App ─────────────────────────────────────────────────────────────
function FormApp() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlCode = searchParams.get('code') || searchParams.get('project');
  const urlToken = searchParams.get('token');
  const source = searchParams.get('source') === 'assessor' ? 'assessor' : 'customer';

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!urlCode);
  const projectMatchesUrl = !urlCode || project?.code === urlCode;
  const activeProject = urlCode && projectMatchesUrl ? project : null;
  const activeLoadError = urlCode ? loadError : null;
  const activeLoading = !!urlCode && (loading || (!projectMatchesUrl && !loadError));
  const projectFollowUpDocumentFlow = hasExistingRepresentationFlow(activeProject?.formData ?? null);
  const prepareProjectLoad = useEffectEvent(() => {
    setLoading(true);
    setLoadError(null);
  });

  // Read current project without adding it to effect deps.
  // Used to skip a redundant re-fetch when we already have the project in memory
  // (e.g. the phone flow: handlePhoneConfirmed sets project then navigates, which
  // changes urlCode and would otherwise trigger an unnecessary second network request).
  const getCurrentProject = useEffectEvent(() => project);

  // If URL has a code, load it on mount
  useEffect(() => {
    if (!urlCode) return;

    // If we already hold this project in memory (e.g. just created via phone flow),
    // skip the server round-trip entirely. The loading flag was never set to true
    // in this path, so no spinner is shown.
    const current = getCurrentProject();
    if (current?.code === urlCode) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    prepareProjectLoad();

    const timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort();
        setLoadError('NETWORK_ERROR');
        setLoading(false);
      }
    }, 12000);

    fetchProject(urlCode, { signal: controller.signal, token: urlToken || undefined })
      .then(async (res) => {
        if (controller.signal.aborted) return;

        if (res.success && res.project) {
          let normalizedProject = normalizeLoadedProject(res.project);

          const serverTs = normalizedProject.lastActivity
            ? new Date(normalizedProject.lastActivity).getTime()
            : 0;

          // Prefer localStorage (synchronous, fastest) then fall back to IndexedDB.
          // IndexedDB never fails due to storage quota, so it's the reliable long-term store.
          const localBackup = readLocalBackup(urlCode);
          const idbBackup = localBackup ? null : await readIndexedDBBackup(urlCode);
          const bestBackup = localBackup ?? idbBackup;

          if (bestBackup) {
            const backupFd = normalizeFormData(bestBackup.formData as Parameters<typeof normalizeFormData>[0]);

            // If the backup predates the project's creation time, the project was
            // deleted and recreated (possibly with the same code). Discard stale data.
            const projectCreatedAt = normalizedProject.createdAt
              ? new Date(normalizedProject.createdAt).getTime()
              : 0;
            const backupIsStalePriorSession = projectCreatedAt > 0 && bestBackup.savedAt < projectCreatedAt - 1000;
            if (backupIsStalePriorSession) {
              clearLocalBackup(urlCode);
            } else if (bestBackup.savedAt > serverTs + 500) {
              // Backup is significantly newer than server — use it for everything
              // (e.g. user changed something and reloaded before server auto-save fired).
              normalizedProject = { ...normalizedProject, formData: backupFd };
            } else {
              normalizedProject = mergeProjectWithDeviceBackup(normalizedProject, backupFd);
            }
          }

          setProject(normalizedProject);
          return;
        }

        const accessError = res.error === 'UNAUTHORIZED'
          || res.error === 'INVALID_TOKEN'
          || res.error === 'FORBIDDEN'
          || res.status === 401;

        if (accessError) {
          setProject(null);
          setLoadError('INVALID_TOKEN');
          return;
        }

        // Project was deleted or never existed — clear stale local data and go back
        // to the phone entry screen rather than showing a dead-end error page.
        // The assessor can then re-enter the phone number and create a new project.
        if (res.error === 'PROJECT_NOT_FOUND' || res.status === 404) {
          if (urlCode) clearLocalBackup(urlCode);
          setProject(null);
          navigate('/', { replace: true });
          return;
        }

        setProject(null);
        setLoadError(res.error || 'NETWORK_ERROR');
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === 'AbortError') return;

        setProject(null);
        setLoadError(err?.message === 'PROJECT_NOT_FOUND' || err?.status === 404 ? 'PROJECT_NOT_FOUND' : 'NETWORK_ERROR');
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => { controller.abort(); clearTimeout(timeoutId); };
  }, [urlCode, urlToken]);


  // When navigating from the review checklist into property-docs, remember which
  // specific doc the user tapped so PropertyDocsSection can scroll to it.
  const [propertyDocsTarget, setPropertyDocsTarget] = useState<string | undefined>();

  // Current section — smart routing based on what's already completed
  const [currentSection, setCurrentSection] = useState<Section | 'phone'>(
    urlCode ? 'property-docs' : 'phone'
  );
  const activeSection: Section | 'phone' = urlCode ? currentSection : 'phone';

  const syncInitialSection = useEffectEvent((
    nextProject: ProjectData | null,
    nextUrlCode: string | null
  ) => {
    if (!nextProject) return;
    setCurrentSection(getInitialSection(nextProject, nextUrlCode));
  });

  // Determine initial section when project loads
  useEffect(() => {
    void syncInitialSection(activeProject, urlCode);
  }, [activeProject, urlCode]);

  const {
    formData, errors, documentProcessing, hasBlockingDocumentProcessing,
    setDNIFrontPhoto, setDNIFrontExtraction,
    setDNIBackPhoto, setDNIBackExtraction,
    setDNIIssue,
    mergeDNIOriginalPdfs,
    setIBIDocument,
    setIBIIssue,
    addElectricityPages, removeElectricityPage,
    setElectricityIssue,
    addAdditionalBankDocuments,
    replaceAdditionalBankDocument,
    removeAdditionalBankDocument,
    setLocation,
    setRepresentation,
    setEnergyCertificate,
    setDocumentProcessingState,
    validatePropertyDocs,
    canSubmit,
  } = useFormState(
    activeProject?.code ?? null,
    activeProject?.productType ?? 'solar',
    activeProject?.formData ?? null,
    {
      preserveRepresentationSignaturesOnDocumentChange: projectFollowUpDocumentFlow,
      source,
      projectToken: urlToken || undefined,
    }
  );
  const followUpDocumentFlow = hasExistingRepresentationFlow(formData);

  // Persistence: instant localStorage backup (300ms debounce) + beforeunload server flush
  useLocalStorageBackup(activeProject?.code ?? null, formData);
  useBeforeUnloadSave(activeProject?.code ?? null, formData, source, urlToken || undefined);
  const nextLikelySection = getLikelyNextSection(activeSection, formData, followUpDocumentFlow);
  const hasSkippedInitialPrefetch = useRef(false);

  useEffect(() => {
    if (!activeProject || activeLoading || activeSection === 'phone' || activeSection === 'success') return;
    if (!hasSkippedInitialPrefetch.current) {
      hasSkippedInitialPrefetch.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      prefetchCustomerSection(nextLikelySection);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [activeLoading, activeProject, activeSection, nextLikelySection]);

  // Auto-set location from contract province when no location is selected yet
  useEffect(() => {
    const contractProvince = formData.contract?.extraction?.extractedData?.province;
    if (!contractProvince) return;
    const currentLocation = formData.location ?? formData.representation?.location ?? null;
    // Skip if a valid region is already set.  Treat legacy 'other' as unset so
    // the contract province can still promote it to a real supported region.
    if (currentLocation && currentLocation !== 'other') return;
    const info = getLocationInfo(String(contractProvince));
    // Only auto-set location for the three supported regions.
    // Provinces outside these map to 'other', which is no longer a valid
    // user-selectable option — the user will be prompted to pick manually.
    if (info && info.id !== 'other') setLocation(info.id);
  }, [formData.contract?.extraction, formData.location, formData.representation?.location, setLocation]);

  const goTo = (section: Section | 'phone') => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentSection(section);
    if (urlCode) saveSectionToStorage(urlCode, section);
  };

  // Keep a ref to formData so the popstate handler always has the current value
  // without needing to be re-registered every time formData changes.
  const formDataRef = useRef(formData);
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  // When a returning customer is in the document upload screen (follow-up mode),
  // intercept the phone's hardware/browser back button so they land back on the
  // "Sube lo que falte" review screen instead of the phone-number entry screen.
  useEffect(() => {
    if (activeSection !== 'property-docs' || !followUpDocumentFlow) return;

    // Push a sentinel entry so there is always something to pop back to.
    window.history.pushState({ eltexBack: true }, '');

    const handlePopState = () => {
      // Re-push so repeated back presses keep being intercepted.
      window.history.pushState({ eltexBack: true }, '');
      const dest = hasEnergyCertificateDecision(formDataRef.current.energyCertificate)
        ? 'review'
        : 'energy-certificate';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setCurrentSection(dest);
      if (urlCode) saveSectionToStorage(urlCode, dest);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, followUpDocumentFlow]);

  const handlePhoneConfirmed = async (_phone: string, foundProject: ProjectData) => {
    let normalizedProject = normalizeLoadedProject(foundProject);

    // Merge any local backup so that photos the user uploaded earlier are
    // restored immediately — the URL-based load path does this but the phone
    // path previously skipped it, causing uploads to disappear on return.
    const code = foundProject.code;
    const serverTs = normalizedProject.lastActivity
      ? new Date(normalizedProject.lastActivity).getTime()
      : 0;

    const localBackup = readLocalBackup(code);
    const idbBackup = localBackup ? null : await readIndexedDBBackup(code);
    const bestBackup = localBackup ?? idbBackup;

    if (bestBackup) {
      const backupFd = normalizeFormData(bestBackup.formData as Parameters<typeof normalizeFormData>[0]);
      const projectCreatedAt = normalizedProject.createdAt
        ? new Date(normalizedProject.createdAt).getTime()
        : 0;
      const backupIsStale = projectCreatedAt > 0 && bestBackup.savedAt < projectCreatedAt - 1000;
      if (backupIsStale) {
        clearLocalBackup(code);
      } else if (bestBackup.savedAt > serverTs + 500) {
        normalizedProject = { ...normalizedProject, formData: backupFd };
      } else {
        normalizedProject = mergeProjectWithDeviceBackup(normalizedProject, backupFd);
      }
    }

    setProject(normalizedProject);
    navigate(buildProjectUrl(foundProject.code, 'customer', foundProject.accessToken), { replace: true });
    goTo(getInitialSection(normalizedProject, foundProject.code));
  };

  const renderSection = () => {
    if (activeSection === 'phone') {
      return (
        <PhoneSection
          onPhoneConfirmed={handlePhoneConfirmed}
          onContinue={() => { }}
        />
      );
    }

    if (activeLoading) return <LoadingSection />;
    if (activeLoadError || !activeProject) return <ErrorSection error={activeLoadError || 'PROJECT_NOT_FOUND'} />;

    switch (activeSection as Section) {
      case 'property-docs':
        return (
          <PropertyDocsSection
            dni={formData.dni}
            ibi={formData.ibi}
            electricityBill={formData.electricityBill}
            additionalBankDocuments={formData.additionalBankDocuments ?? []}
            followUpMode={followUpDocumentFlow}
            errors={errors}
            documentProcessing={documentProcessing}
            hasBlockingDocumentProcessing={hasBlockingDocumentProcessing}
            onDNIFrontPhotoChange={setDNIFrontPhoto}
            onDNIFrontExtractionChange={setDNIFrontExtraction}
            onDNIBackPhotoChange={setDNIBackPhoto}
            onDNIBackExtractionChange={setDNIBackExtraction}
            onDNIIssueChange={setDNIIssue}
            onDNIOriginalPdfsMerge={mergeDNIOriginalPdfs}
            onIBIDocumentChange={setIBIDocument}
            onIBIIssueChange={setIBIIssue}
            onAddElectricityPages={addElectricityPages}
            onRemoveElectricityPage={removeElectricityPage}
            onElectricityIssueChange={setElectricityIssue}
            onAddAdditionalBankDocuments={addAdditionalBankDocuments}
            onReplaceAdditionalBankDocument={replaceAdditionalBankDocument}
            onRemoveAdditionalBankDocument={removeAdditionalBankDocument}
            onDocumentProcessingChange={setDocumentProcessingState}
            scrollToDoc={propertyDocsTarget}
            onBack={followUpDocumentFlow ? () => goTo('review') : undefined}
            onContinue={() => {
              if (!validatePropertyDocs()) return;
              if (followUpDocumentFlow) {
                goTo(
                  hasEnergyCertificateDecision(formData.energyCertificate)
                    ? 'review'
                    : 'energy-certificate'
                );
                return;
              }
              goTo('province-selection');
            }}
          />
        );

      case 'province-selection':
        return (
          <ProvinceSelectionSection
            formData={formData}
            representationData={formData.representation}
            onLocationSelect={setLocation}
            onRepresentationChange={(patch: Partial<RepresentationData>) => setRepresentation({ ...formData.representation, ...patch })}
            onBack={() => goTo('property-docs')}
            onContinue={() => {
              const loc = formData.location ?? formData.representation?.location ?? null;
              goTo(
                loc === 'other'
                  ? (
                    hasEnergyCertificateDecision(formData.energyCertificate)
                      ? 'review'
                      : 'energy-certificate'
                  )
                  : 'representation'
              );
            }}
          />
        );

      case 'representation':
        return (
          <RepresentationSection
            formData={formData}
            location={formData.location ?? formData.representation.location ?? null}
            onChange={setRepresentation}
            onBack={() => goTo('province-selection')}
            onContinue={() => goTo(
              hasEnergyCertificateDecision(formData.energyCertificate)
                ? 'review'
                : 'energy-certificate'
            )}
          />
        );

      case 'energy-certificate':
        return (
          <EnergyCertificateSection
            project={activeProject}
            formData={formData}
            data={formData.energyCertificate}
            onChange={setEnergyCertificate}
            onBack={() => {
              if (followUpDocumentFlow) {
                goTo('review');
                return;
              }
              const energyLoc = formData.location ?? formData.representation?.location ?? null;
              goTo(energyLoc === 'other' ? 'province-selection' : 'representation');
            }}
            onContinue={() => goTo('review')}
          />
        );

      case 'review': {
        return (
          <ReviewSection
            project={activeProject}
            formData={formData}
            source={source}
            projectToken={urlToken || undefined}
            canSubmit={canSubmit()}
            hasBlockingDocumentProcessing={hasBlockingDocumentProcessing}
            followUpMode={followUpDocumentFlow}
            onEdit={(s: string) => {
              const [sectionName, docTarget] = s.split(':');
              setPropertyDocsTarget(docTarget || undefined);
              goTo(sectionName as Section);
            }}
            onSuccess={() => {
              const resolvedName = (
                formData.contract?.extraction?.extractedData?.fullName
                || formData.dni?.front?.extraction?.extractedData?.fullName
                || formData.ibi?.extraction?.extractedData?.titular
                || formData.electricityBill?.pages?.[0]?.extraction?.extractedData?.titular
                || null
              ) as string | null;
              if (resolvedName && activeProject && resolvedName !== activeProject.customerName) {
                setProject({ ...activeProject, customerName: resolvedName });
              }
              goTo('success');
            }}
            onBack={followUpDocumentFlow ? undefined : () => goTo('energy-certificate')}
          />
        );
      }

      case 'success':
        return <SuccessSection project={activeProject} />;

      default:
        return <ErrorSection error="UNKNOWN_ERROR" />;
    }
  };

  const showProgressBar = !activeLoading && !activeLoadError && !!activeProject
    && activeSection !== 'phone' && activeSection !== 'success';

  return (
    <div className="min-h-screen bg-white">
      <Toaster
        position="top-center"
        toastOptions={{ style: { background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '12px' } }}
      />
      {showProgressBar && <FlowProgressBar currentSection={activeSection} />}
      <main className={showProgressBar ? 'pt-11' : ''}>
        <ChunkErrorBoundary>
          <Suspense fallback={<LoadingSection />}>
            {renderSection()}
          </Suspense>
        </ChunkErrorBoundary>
      </main>
    </div>
  );
}

// ── Redirect any section deep-link back to the SPA root (preserving ?code=...) ─
function RedirectToRoot() {
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  return <Navigate to={qs ? `/?${qs}` : '/'} replace />;
}

// ── Root with Router ──────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FormApp />} />
        <Route path="/dashboard" element={<DashboardApp />} />
        {/* Section deep-links — redirect back to root so the SPA renders correctly */}
        <Route path="/property-docs" element={<RedirectToRoot />} />
        <Route path="/province-selection" element={<RedirectToRoot />} />
        <Route path="/representation" element={<RedirectToRoot />} />
        <Route path="/energy-certificate" element={<RedirectToRoot />} />
        <Route path="/review" element={<RedirectToRoot />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
