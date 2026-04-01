import { lazy, Suspense, useState, useEffect, useEffectEvent } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter, Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import { normalizeFormData, useFormState } from '@/hooks/useFormState';
import { fetchProject } from '@/services/api';
import { PhoneSection } from '@/sections/PhoneSection';
import { PropertyDocsSection } from '@/sections/PropertyDocsSection';
import { ErrorSection } from '@/sections/ErrorSection';
import { LoadingSection } from '@/sections/LoadingSection';
import { isIdentityDocumentComplete } from '@/lib/identityDocument';
import { isEnergyCertificateReadyToComplete } from '@/lib/energyCertificateValidation';
import { getLocationInfo } from '@/lib/provinceMapping';
import type { FormData, ProjectData, Section } from '@/types';
import './App.css';

const ProvinceSelectionSection = lazy(() => import('@/sections/ProvinceSelectionSection').then((module) => ({ default: module.ProvinceSelectionSection })));
const RepresentationSection = lazy(() => import('@/sections/RepresentationSection').then((module) => ({ default: module.RepresentationSection })));
const EnergyCertificateSection = lazy(() => import('@/sections/EnergyCertificateSection').then((module) => ({ default: module.EnergyCertificateSection })));
const ReviewSection = lazy(() => import('@/sections/ReviewSection').then((module) => ({ default: module.ReviewSection })));
const SuccessSection = lazy(() => import('@/sections/SuccessSection').then((module) => ({ default: module.SuccessSection })));
const Dashboard = lazy(() => import('@/pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const DashboardLogin = lazy(() => import('@/pages/DashboardLogin').then((module) => ({ default: module.DashboardLogin })));

// ── Dashboard wrapper (handles login gate) ────────────────────────────────────
function DashboardApp() {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('dashboard_token')
  );

  return (
    <Suspense fallback={<LoadingSection />}>
      {!token ? (
        <DashboardLogin onLogin={setToken} />
      ) : (
        <Dashboard token={token} onLogout={() => setToken(null)} />
      )}
    </Suspense>
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

function hasEnergyCertificateDecision(formData: FormData | null): boolean {
  if (!formData) return false;
  const status = formData.energyCertificate?.status;
  if (status === 'skipped') return true;
  // Only treat 'completed' as a real decision if all required fields pass validation.
  // This prevents routing to 'review' when a stale/invalid 'completed' is in state.
  if (status === 'completed') return isEnergyCertificateReadyToComplete(formData.energyCertificate);
  return false;
}

function getInitialSection(
  project: ProjectData | null,
  urlCode: string | null
): Section | 'phone' {
  if (!project || !urlCode) return urlCode ? 'property-docs' : 'phone';

  const fd = project.formData;
  const location = fd?.location ?? fd?.representation?.location ?? null;
  const followUpDocumentFlow = hasExistingRepresentationFlow(fd);
  const hasEnergyDecision = hasEnergyCertificateDecision(fd);

  if (followUpDocumentFlow && !hasPropertyDocsDone(fd)) return 'property-docs';
  if (followUpDocumentFlow) return hasEnergyDecision ? 'review' : 'energy-certificate';
  if (hasRepresentationDone(fd, location)) return hasEnergyDecision ? 'review' : 'energy-certificate';
  if (location === 'other') return hasEnergyDecision ? 'review' : 'energy-certificate';
  if (location) return 'representation';
  if (hasPropertyDocsDone(fd)) return 'province-selection';
  return 'property-docs';
}

// ── Token persistence: survives page refresh after phone lookup ───────────────
function getStoredToken(code: string): string | null {
  try { return sessionStorage.getItem(`project_token_${code}`); } catch { return null; }
}
function storeToken(code: string, token: string) {
  try { sessionStorage.setItem(`project_token_${code}`, token); } catch { /* ignore */ }
}

function buildProjectUrl(code: string, token?: string | null, source?: 'customer' | 'assessor') {
  const params = new URLSearchParams({ code });
  if (token) params.set('token', token);
  if (source === 'assessor') params.set('source', 'assessor');
  return `/?${params.toString()}`;
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

  // Resolve token: URL param → sessionStorage fallback
  const resolvedToken = urlToken ?? (urlCode ? getStoredToken(urlCode) : null);

  const [project, setProject] = useState<ProjectData | null>(null);
  const [projectToken, setProjectToken] = useState<string | null>(resolvedToken);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!urlCode);
  const [autoSubmitReview, setAutoSubmitReview] = useState(false);
  const projectMatchesUrl = !urlCode || project?.code === urlCode;
  const activeProject = urlCode && projectMatchesUrl ? project : null;
  const activeProjectToken = urlCode ? projectToken : null;
  const activeLoadError = urlCode ? loadError : null;
  const activeLoading = !!urlCode && (loading || (!projectMatchesUrl && !loadError));
  const projectFollowUpDocumentFlow = hasExistingRepresentationFlow(activeProject?.formData ?? null);
  const prepareProjectLoad = useEffectEvent(() => {
    setLoading(true);
    setLoadError(null);
  });

  // If URL has a code, load it on mount
  useEffect(() => {
    if (!urlCode) return;

    const controller = new AbortController();
    const token = urlToken ?? getStoredToken(urlCode);

    prepareProjectLoad();

    fetchProject(urlCode, token, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;

        if (res.success && res.project) {
          const normalizedProject = normalizeLoadedProject(res.project);
          setProject(normalizedProject);

          // Persist whichever token we have so refreshes keep working.
          const activeToken = token ?? normalizedProject.accessToken ?? null;
          setProjectToken(activeToken);
          if (activeToken) storeToken(urlCode, activeToken);
          return;
        }

        setProject(null);
        setProjectToken(null);
        setLoadError(res.error || 'PROJECT_NOT_FOUND');
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        setProject(null);
        setProjectToken(null);
        setLoadError('NETWORK_ERROR');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [urlCode, urlToken]);

  useEffect(() => {
    if (!urlCode || !projectToken || urlToken) return;
    navigate(buildProjectUrl(urlCode, projectToken, source), { replace: true });
  }, [navigate, projectToken, source, urlCode, urlToken]);

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
    mergeDNIOriginalPdfs,
    setIBIDocument,
    addElectricityPages, removeElectricityPage,
    setContract,
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
    activeProjectToken,
    { preserveRepresentationSignaturesOnDocumentChange: projectFollowUpDocumentFlow }
  );
  const followUpDocumentFlow = hasExistingRepresentationFlow(formData);

  // Auto-set location from contract province when no location is selected yet
  useEffect(() => {
    const contractProvince = formData.contract?.extraction?.extractedData?.province;
    if (!contractProvince) return;
    const currentLocation = formData.location ?? formData.representation?.location ?? null;
    if (currentLocation) return;
    const info = getLocationInfo(String(contractProvince));
    if (info) setLocation(info.id);
  }, [formData.contract?.extraction]);

  const goTo = (section: Section | 'phone') => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentSection(section);
  };

  const handlePhoneConfirmed = (_phone: string, foundProject: ProjectData) => {
    const normalizedProject = normalizeLoadedProject(foundProject);
    setProject(normalizedProject);
    const token = normalizedProject.accessToken || null;
    setProjectToken(token);
    // Persist so page refresh after phone lookup doesn't hit FORBIDDEN
    if (token) storeToken(foundProject.code, token);
    navigate(buildProjectUrl(foundProject.code, token, 'assessor'), { replace: true });
    goTo('property-docs');
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
            contract={formData.contract}
            followUpMode={followUpDocumentFlow}
            errors={errors}
            documentProcessing={documentProcessing}
            hasBlockingDocumentProcessing={hasBlockingDocumentProcessing}
            onDNIFrontPhotoChange={setDNIFrontPhoto}
            onDNIFrontExtractionChange={setDNIFrontExtraction}
            onDNIBackPhotoChange={setDNIBackPhoto}
            onDNIBackExtractionChange={setDNIBackExtraction}
            onDNIOriginalPdfsMerge={mergeDNIOriginalPdfs}
            onIBIDocumentChange={setIBIDocument}
            onAddElectricityPages={addElectricityPages}
            onRemoveElectricityPage={removeElectricityPage}
            onDocumentProcessingChange={setDocumentProcessingState}
            onContractChange={setContract}
            onBack={() => goTo('phone')}
            onContinue={() => {
              if (!validatePropertyDocs()) return;
              if (followUpDocumentFlow) {
                goTo(hasEnergyCertificateDecision(formData) ? 'review' : 'energy-certificate');
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
            onRepresentationChange={(patch) => setRepresentation({ ...formData.representation, ...patch })}
            onBack={() => goTo('property-docs')}
            onContinue={() => {
              const loc = formData.location ?? formData.representation?.location ?? null;
              goTo(loc === 'other'
                ? (hasEnergyCertificateDecision(formData) ? 'review' : 'energy-certificate')
                : 'representation');
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
            onContinue={() => goTo('energy-certificate')}
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
                goTo('property-docs');
                return;
              }
              const energyLoc = formData.location ?? formData.representation?.location ?? null;
              goTo(energyLoc === 'other' ? 'province-selection' : 'representation');
            }}
            onContinue={() => { setAutoSubmitReview(true); goTo('review'); }}
          />
        );

      case 'review': {
        return (
          <ReviewSection
            project={activeProject}
            formData={formData}
            source={source}
            canSubmit={canSubmit()}
            hasBlockingDocumentProcessing={hasBlockingDocumentProcessing}
            followUpMode={followUpDocumentFlow}
            onEdit={(s) => { setAutoSubmitReview(false); goTo(s as Section); }}
            onSuccess={() => goTo('success')}
            projectToken={activeProjectToken}
            onBack={() => { setAutoSubmitReview(false); goTo('energy-certificate'); }}
            autoSubmit={autoSubmitReview}
          />
        );
      }

      case 'success':
        return <SuccessSection project={activeProject} />;

      default:
        return <ErrorSection error="UNKNOWN_ERROR" />;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Toaster
        position="top-center"
        toastOptions={{ style: { background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '12px' } }}
      />
      <main>
        <Suspense fallback={<LoadingSection />}>
          {renderSection()}
        </Suspense>
      </main>
    </div>
  );
}

// ── Root with Router ──────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FormApp />} />
        <Route path="/dashboard" element={<DashboardApp />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
