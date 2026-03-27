import { lazy, Suspense, useState, useEffect, useEffectEvent } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter, Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import { useFormState } from '@/hooks/useFormState';
import { fetchProject } from '@/services/api';
import { PhoneSection } from '@/sections/PhoneSection';
import { PropertyDocsSection } from '@/sections/PropertyDocsSection';
import { ErrorSection } from '@/sections/ErrorSection';
import { LoadingSection } from '@/sections/LoadingSection';
import { isIdentityDocumentComplete } from '@/lib/identityDocument';
import type { FormData, ProjectData, Section } from '@/types';
import './App.css';

const ProvinceSelectionSection = lazy(() => import('@/sections/ProvinceSelectionSection').then((module) => ({ default: module.ProvinceSelectionSection })));
const RepresentationSection = lazy(() => import('@/sections/RepresentationSection').then((module) => ({ default: module.RepresentationSection })));
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

function getInitialSection(
  project: ProjectData | null,
  urlCode: string | null
): Section | 'phone' {
  if (!project || !urlCode) return urlCode ? 'property-docs' : 'phone';

  const fd = project.formData;
  const location = fd?.location ?? fd?.representation?.location ?? null;
  const followUpDocumentFlow = hasExistingRepresentationFlow(fd);

  if (followUpDocumentFlow && !hasPropertyDocsDone(fd)) return 'property-docs';
  if (hasRepresentationDone(fd, location)) return 'review';
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
  const projectFollowUpDocumentFlow = hasExistingRepresentationFlow(project?.formData ?? null);

  const loadProjectFromUrl = useEffectEvent((code: string, token?: string | null) => {
    setLoading(true);
    fetchProject(code, token)
      .then(res => {
        if (res.success && res.project) {
          setProject(res.project);
          // Persist whichever token we have so refreshes keep working
          const activeToken = token ?? res.project.accessToken ?? null;
          if (activeToken) {
            setProjectToken(activeToken);
            storeToken(code, activeToken);
          }
        } else {
          setLoadError(res.error || 'PROJECT_NOT_FOUND');
        }
      })
      .catch(() => setLoadError('NETWORK_ERROR'))
      .finally(() => setLoading(false));
  });

  // If URL has a code, load it on mount
  useEffect(() => {
    if (!urlCode) return;
    const token = urlToken ?? getStoredToken(urlCode);
    void loadProjectFromUrl(urlCode, token);
  }, [urlCode, urlToken]);

  useEffect(() => {
    if (!urlCode || !projectToken || urlToken) return;
    navigate(buildProjectUrl(urlCode, projectToken, source), { replace: true });
  }, [navigate, projectToken, source, urlCode, urlToken]);

  // Current section — smart routing based on what's already completed
  const [currentSection, setCurrentSection] = useState<Section | 'phone'>(
    urlCode ? 'property-docs' : 'phone'
  );

  const syncInitialSection = useEffectEvent((
    nextProject: ProjectData | null,
    nextUrlCode: string | null
  ) => {
    if (!nextProject) return;
    setCurrentSection(getInitialSection(nextProject, nextUrlCode));
  });

  // Determine initial section when project loads
  useEffect(() => {
    void syncInitialSection(project, urlCode);
  }, [project, urlCode]);

  const {
    formData, errors, documentProcessing, hasBlockingDocumentProcessing,
    setDNIFrontPhoto, setDNIFrontExtraction,
    setDNIBackPhoto, setDNIBackExtraction,
    mergeDNIOriginalPdfs,
    setIBIDocument,
    addElectricityPages, removeElectricityPage,
    setLocation,
    setRepresentation,
    setDocumentProcessingState,
    validatePropertyDocs,
    canSubmit,
  } = useFormState(
    project?.code ?? null,
    project?.productType ?? 'solar',
    project?.formData ?? null,
    projectToken,
    { preserveRepresentationSignaturesOnDocumentChange: projectFollowUpDocumentFlow }
  );
  const followUpDocumentFlow = hasExistingRepresentationFlow(formData);

  const goTo = (section: Section | 'phone') => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentSection(section);
  };

  const handlePhoneConfirmed = (_phone: string, foundProject: ProjectData) => {
    setProject(foundProject);
    const token = foundProject.accessToken || null;
    setProjectToken(token);
    // Persist so page refresh after phone lookup doesn't hit FORBIDDEN
    if (token) storeToken(foundProject.code, token);
    navigate(buildProjectUrl(foundProject.code, token, 'assessor'), { replace: true });
    goTo('property-docs');
  };

  const renderSection = () => {
    if (currentSection === 'phone') {
      return (
        <PhoneSection
          onPhoneConfirmed={handlePhoneConfirmed}
          onContinue={() => { }}
        />
      );
    }

    if (loading) return <LoadingSection />;
    if (loadError || !project) return <ErrorSection error={loadError || 'PROJECT_NOT_FOUND'} />;

    switch (currentSection as Section) {
      case 'property-docs':
        return (
          <PropertyDocsSection
            dni={formData.dni}
            ibi={formData.ibi}
            electricityBill={formData.electricityBill}
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
            onBack={() => goTo('phone')}
            onContinue={() => {
              if (!validatePropertyDocs()) return;
              if (followUpDocumentFlow) {
                goTo('review');
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
              goTo(loc === 'other' ? 'review' : 'representation');
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
            onContinue={() => goTo('review')}
          />
        );

      case 'review': {
        const reviewLoc = formData.location ?? formData.representation?.location ?? null;
        return (
          <ReviewSection
            project={project}
            formData={formData}
            source={source}
            canSubmit={canSubmit()}
            hasBlockingDocumentProcessing={hasBlockingDocumentProcessing}
            followUpMode={followUpDocumentFlow}
            onEdit={(s) => goTo(s as Section)}
            onSuccess={() => goTo('success')}
            projectToken={projectToken}
            onBack={() => goTo(followUpDocumentFlow ? 'property-docs' : reviewLoc === 'other' ? 'province-selection' : 'representation')}
          />
        );
      }

      case 'success':
        return <SuccessSection project={project} />;

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
