import { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter, Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import { useFormState } from '@/hooks/useFormState';
import { fetchProject } from '@/services/api';
import { PhoneSection } from '@/sections/PhoneSection';
import { PropertyDocsSection } from '@/sections/PropertyDocsSection';
import { ProvinceSelectionSection } from '@/sections/ProvinceSelectionSection';
import { RepresentationSection } from '@/sections/RepresentationSection';
import { ReviewSection } from '@/sections/ReviewSection';
import { SuccessSection } from '@/sections/SuccessSection';
import { ErrorSection } from '@/sections/ErrorSection';
import { LoadingSection } from '@/sections/LoadingSection';
import { Dashboard } from '@/pages/Dashboard';
import { DashboardLogin } from '@/pages/DashboardLogin';
import type { FormData, ProjectData, Section } from '@/types';
import './App.css';

// ── Dashboard wrapper (handles login gate) ────────────────────────────────────
function DashboardApp() {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('dashboard_token')
  );

  if (!token) {
    return <DashboardLogin onLogin={setToken} />;
  }

  return <Dashboard token={token} onLogout={() => setToken(null)} />;
}

// ── Helpers for smart section routing ─────────────────────────────────────────
function hasPropertyDocsDone(formData: FormData | null): boolean {
  if (!formData) return false;
  return !!(formData.dni?.front?.photo || formData.dni?.back?.photo);
}

function hasRepresentationDone(formData: FormData | null, location: string | null): boolean {
  if (!formData || !location) return false;
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

function getInitialSection(project: ProjectData | null, urlCode: string | null): Section | 'phone' {
  if (!project || !urlCode) return urlCode ? 'property-docs' : 'phone';

  const fd = project.formData;
  const location = fd?.location ?? fd?.representation?.location ?? null;

  if (hasRepresentationDone(fd, location)) return 'review';
  if (location) return 'representation';
  if (hasPropertyDocsDone(fd)) return 'province-selection';
  return 'property-docs';
}

// ── Main Form App ─────────────────────────────────────────────────────────────
function FormApp() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlCode = searchParams.get('code') || searchParams.get('project');
  const urlToken = searchParams.get('token');

  const [project, setProject] = useState<ProjectData | null>(null);
  const [projectToken, setProjectToken] = useState<string | null>(urlToken);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!urlCode);

  // If URL has a code, load it on mount
  useEffect(() => {
    if (!urlCode) return;
    setLoading(true);
    fetchProject(urlCode, urlToken)
      .then(res => {
        if (res.success && res.project) {
          setProject(res.project);
          // Capture token from project if not already in URL
          if (!urlToken && res.project.accessToken) {
            setProjectToken(res.project.accessToken);
          }
        } else {
          setLoadError(res.error || 'PROJECT_NOT_FOUND');
        }
      })
      .catch(() => setLoadError('CONNECTION_ERROR'))
      .finally(() => setLoading(false));
  }, [urlCode, urlToken]);

  // Current section — smart routing based on what's already completed
  const [currentSection, setCurrentSection] = useState<Section | 'phone'>(
    urlCode ? 'property-docs' : 'phone'
  );

  // Determine initial section when project loads
  useEffect(() => {
    if (!project) return;
    setCurrentSection(getInitialSection(project, urlCode));
  }, [project, urlCode]);

  const {
    formData, errors, documentProcessing, hasBlockingDocumentProcessing,
    setDNIFrontPhoto, setDNIFrontExtraction,
    setDNIBackPhoto, setDNIBackExtraction,
    setIBIPhoto, setIBIExtraction,
    addElectricityPage, removeElectricityPage,
    setLocation,
    setRepresentation,
    setDocumentProcessingState,
    validatePropertyDocs, validateRepresentation,
    canSubmit,
  } = useFormState(project?.code ?? null, project?.productType ?? 'solar', project?.formData ?? null, projectToken);

  const goTo = (section: Section | 'phone') => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentSection(section);
  };

  const handlePhoneConfirmed = (_phone: string, foundProject: ProjectData) => {
    setProject(foundProject);
    const token = foundProject.accessToken || null;
    setProjectToken(token);
    const tokenParam = token ? `&token=${token}` : '';
    navigate(`/?code=${foundProject.code}${tokenParam}`, { replace: true });
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
            errors={errors}
            documentProcessing={documentProcessing}
            hasBlockingDocumentProcessing={hasBlockingDocumentProcessing}
            onDNIFrontPhotoChange={setDNIFrontPhoto}
            onDNIFrontExtractionChange={setDNIFrontExtraction}
            onDNIBackPhotoChange={setDNIBackPhoto}
            onDNIBackExtractionChange={setDNIBackExtraction}
            onIBIPhotoChange={setIBIPhoto}
            onIBIExtractionChange={setIBIExtraction}
            onAddElectricityPage={addElectricityPage}
            onRemoveElectricityPage={removeElectricityPage}
            onDocumentProcessingChange={setDocumentProcessingState}
            onBack={() => goTo('phone')}
            onContinue={() => {
              if (validatePropertyDocs()) goTo('province-selection');
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
            onContinue={() => goTo('representation')}
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

      case 'review':
        return (
          <ReviewSection
            project={project}
            formData={formData}
            source={urlCode ? 'customer' : 'assessor'}
            canSubmit={canSubmit()}
            hasBlockingDocumentProcessing={hasBlockingDocumentProcessing}
            onEdit={(s) => goTo(s as Section)}
            onSuccess={() => goTo('success')}
            projectToken={projectToken}
          />
        );

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
      <main>{renderSection()}</main>
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
