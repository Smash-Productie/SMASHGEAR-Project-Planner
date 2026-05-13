
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Package, 
  LayoutDashboard, 
  Briefcase, 
  Plus, 
  Search, 
  Trash2, 
  CheckCircle2,
  AlertCircle,
  Camera,
  Aperture,
  Battery,
  Lightbulb,
  Monitor,
  Mic,
  Move,
  Calendar as CalendarIcon,
  Clock,
  Printer,
  Save,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  MapPin,
  Disc,
  Filter,
  X,
  Loader2,
  Eye,
  LayoutGrid,
  ShoppingBag,
  ExternalLink,
  LogOut
} from 'lucide-react';
import { GearItem, Project, TabView, GearStatus, ExternalGear } from './types';
import { Button, Input, Card, Badge } from './components/UIComponents';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  OperationType, 
  handleFirestoreError 
} from './services/firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc,
  Timestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { onAuthStateChanged, User, GoogleAuthProvider } from 'firebase/auth';

// --- Types ---
interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

// --- Icons Helper ---
const getCategoryIcon = (category: string) => {
  const c = category.toLowerCase();
  if (c.includes('camera') || c.includes('drone')) return <Camera className="w-5 h-5" />;
  if (c.includes('lenzen') || c.includes('lens')) return <Aperture className="w-5 h-5" />;
  if (c.includes('licht') || c.includes('flits')) return <Lightbulb className="w-5 h-5" />;
  if (c.includes('audio') || c.includes('microfoon')) return <Mic className="w-5 h-5" />;
  if (c.includes('monitor')) return <Monitor className="w-5 h-5" />;
  if (c.includes('power') || c.includes('batterij')) return <Battery className="w-5 h-5" />;
  if (c.includes('grip') || c.includes('statief')) return <Move className="w-5 h-5" />;
  if (c.includes('accessoires')) return <Disc className="w-5 h-5" />;
  return <Package className="w-5 h-5" />;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabView>('DASHBOARD');
  const [inventory, setInventory] = useState<GearItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [shoots, setShoots] = useState<CalendarEvent[]>([]);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [preFilledDetails, setPreFilledDetails] = useState<any>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>('');
  const [googleCalendarId, setGoogleCalendarId] = useState<string>('productie@smashstudios.nl');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showAddShootModal, setShowAddShootModal] = useState(false);
  const [newShootData, setNewShootData] = useState({ 
    summary: '', 
    location: '', 
    startDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endDate: new Date().toISOString().split('T')[0],
    endTime: '18:00'
  });
  
  // Modals state
  const [viewingProject, setViewingProject] = useState<Project | null>(null);
  const [viewingProjectIdFromAgenda, setViewingProjectIdFromAgenda] = useState<string | null>(null);

  // --- Print View Logic ---
  const [printMode, setPrintMode] = useState<{ active: boolean; projectId: string | null }>({
    active: false,
    projectId: null
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('print') === 'true') {
      setPrintMode({
        active: true,
        projectId: params.get('projectId')
      });
    }
  }, []);

  // --- Auth & Data Loading ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Load Inventory
    const unsubInv = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GearItem));
      setInventory(items);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'inventory'));

    // Load Projects
    const unsubProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const projs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(projs);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'projects'));

    // Load Shoots (if stored in Firestore)
    const unsubShoots = onSnapshot(collection(db, 'shoots'), (snapshot) => {
      if (!snapshot.empty) {
        const s = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CalendarEvent));
        setShoots(s);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'shoots'));

    // Load Settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGoogleSheetUrl(data.googleSheetUrl || '');
        setGoogleCalendarId(data.googleCalendarId || 'productie@smashstudios.nl');
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/global'));

    return () => {
      unsubInv();
      unsubProjects();
      unsubShoots();
      unsubSettings();
    };
  }, [user]);

  // Settings persistence
  useEffect(() => {
    if (!user) return;
    const saveSettings = async () => {
      try {
        await setDoc(doc(db, 'settings', 'global'), { 
          googleSheetUrl,
          googleCalendarId 
        }, { merge: true });
      } catch (e) {
        console.error("Failed to save settings", e);
      }
    };
    saveSettings();
  }, [googleSheetUrl, googleCalendarId, user]);

  const handleLogin = async () => {
    try {
      const result = await signInWithGoogle();
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential) {
        setGoogleAccessToken(credential.accessToken || null);
        // Save token to session storage for short-term persistence
        if (credential.accessToken) {
          sessionStorage.setItem('google_access_token', credential.accessToken);
        }
      }
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  useEffect(() => {
    const savedToken = sessionStorage.getItem('google_access_token');
    if (savedToken) setGoogleAccessToken(savedToken);
  }, []);

  const fetchGoogleCalendarEvents = async () => {
    if (!googleAccessToken) {
      // If we don't have a token, we might need to re-login or prompt for it
      handleLogin();
      return;
    }

    setIsSyncing(true);
    try {
      const timeMin = new Date();
      timeMin.setMonth(timeMin.getMonth() - 1); // Get from 1 month ago
      const timeMax = new Date();
      timeMax.setMonth(timeMax.getMonth() + 3); // Up to 3 months ahead

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(googleCalendarId)}/events?` + 
        new URLSearchParams({
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
        }),
        {
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Google Calendar API Error:", errorData);
        
        if (response.status === 401) {
          // Token expired
          setGoogleAccessToken(null);
          sessionStorage.removeItem('google_access_token');
          alert("Sessie verlopen of ongeldig. Log opnieuw in om de agenda te synchroniseren.");
          return;
        }
        throw new Error(`Google Calendar API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Onbekende fout'}`);
      }

      const data = await response.json();
      const items = data.items || [];
      const events: CalendarEvent[] = items.map((item: any) => ({
        id: item.id,
        summary: item.summary || 'Geen titel',
        description: item.description || '',
        location: item.location || '',
        start: item.start || {},
        end: item.end || {},
      }));

      // Update Firestore 'shoots' collection with these events
      // So they persist across sessions for other users too
      for (const event of events) {
        await setDoc(doc(db, 'shoots', event.id), event, { merge: true });
      }

      alert(`Agenda bijgewerkt! ${events.length} afspraken opgehaald.`);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Kon agenda niet synchroniseren.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddManualShoot = async () => {
    if (!newShootData.summary) {
      alert("Vul een titel in voor de shoot.");
      return;
    }

    setIsSyncing(true);
    try {
      const startDateTime = new Date(`${newShootData.startDate}T${newShootData.startTime}`);
      const endDateTime = new Date(`${newShootData.endDate}T${newShootData.endTime}`);

      const event: CalendarEvent = {
        id: 'manual-' + Date.now(),
        summary: newShootData.summary,
        description: 'Manueel toegevoegd',
        location: newShootData.location,
        start: { dateTime: startDateTime.toISOString() },
        end: { dateTime: endDateTime.toISOString() },
      };

      await setDoc(doc(db, 'shoots', event.id), event);
      setShowAddShootModal(false);
      setNewShootData({
        summary: '',
        location: '',
        startDate: new Date().toISOString().split('T')[0],
        startTime: '09:00',
        endDate: new Date().toISOString().split('T')[0],
        endTime: '18:00'
      });
    } catch (error) {
      console.error(error);
      alert("Kon shoot niet toevoegen.");
    } finally {
      setIsSyncing(false);
    }
  };

  const clearInventory = async () => {
    if (confirm("Weet je zeker dat je de VOLLEDIGE inventaris wilt wissen? Dit kan niet ongedaan worden gemaakt.")) {
      try {
        // In a real app, you'd batch delete. Here we do it one by one for simplicity or keep it as is.
        // For Firestore, we might just want to inform that it's better to manage via Sheet.
        for (const item of inventory) {
          await deleteDoc(doc(db, 'inventory', item.id));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'inventory');
      }
    }
  };

  const syncGearFromSheet = async () => {
    if (!googleSheetUrl) {
      alert("Voer eerst een geldige Google Sheet publieke CSV URL in.");
      return;
    }

    setIsSyncing(true);
    try {
      const getCsvUrl = (url: string) => {
        if (url.includes('output=csv')) return url;
        if (url.includes('/d/e/')) {
          if (url.includes('/pub')) {
            return url.includes('?') ? `${url}&output=csv` : `${url}?output=csv`;
          }
          return url;
        }
        if (url.includes('docs.google.com/spreadsheets/d/')) {
          const parts = url.split('/d/');
          if (parts.length > 1) {
            const id = parts[1].split('/')[0];
            let gid = '0';
            const gidMatches = url.match(/gid=([0-9]+)/);
            if (gidMatches && gidMatches[1]) gid = gidMatches[1];
            return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
          }
        }
        return url;
      };

      const baseSyncUrl = getCsvUrl(googleSheetUrl.trim());
      const syncUrl = baseSyncUrl.includes('?') ? `${baseSyncUrl}&t=${Date.now()}` : `${baseSyncUrl}?t=${Date.now()}`;
      const response = await fetch(syncUrl);
      const contentType = response.headers.get("content-type");
      
      if (contentType && contentType.includes("text/html")) {
        if (response.url.includes("accounts.google.com")) {
          throw new Error("De spreadsheet is niet publiek toegankelijk. Ga naar 'Delen' en zet de toegang op 'Iedereen met de link' (Lezer), OF gebruik 'Bestand > Delen > Publiceren op internet' en kies CSV.");
        }
        throw new Error("De link lijkt een normale Google Sheets pagina te zijn in plaats van een CSV export. Zorg dat je de sheet hebt GEPUBLICEERD als CSV via 'Bestand > Delen > Publiceren op internet'.");
      }

      if (!response.ok) throw new Error(`Netwerkfout: ${response.status} ${response.statusText}`);
      const csvText = await response.text();
      
      const parseCSV = (text: string) => {
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        if (lines.length === 0) return [];
        const firstLine = lines[0];
        const commaCount = (firstLine.match(/,/g) || []).length;
        const semiCount = (firstLine.match(/;/g) || []).length;
        const separator = commaCount >= semiCount ? ',' : ';';
        
        return lines.map(line => {
          const result = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === separator && !inQuotes) {
              result.push(current.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
              current = '';
            } else current += char;
          }
          result.push(current.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
          return result;
        });
      };

      const rows = parseCSV(csvText);
      if (rows.length < 2) throw new Error("Onvoldoende data gevonden in CSV.");

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const findIdx = (names: string[]) => {
        for (const name of names) {
          const idx = headers.indexOf(name.toLowerCase());
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const nameIdx = findIdx(['itemnaam', 'name', 'naam', 'item', 'product', 'omschrijving', 'description']);
      const catIdx = findIdx(['type', 'category', 'categorie', 'groep', 'afdeling']);
      const brandIdx = findIdx(['brand', 'merk', 'fabrikant']);
      const modelIdx = findIdx(['model', 'itemnaam']);
      const serialIdx = findIdx(['serie#', 'serial', 'serienummer', 'sn', 'barcode', 's/n']);
      const invIdx = findIdx(['id', 'inventorynumber', 'inventarisnummer', 'nummer', 'nr', 'inv']);
      const remarkIdx = findIdx(['opmerkingen', 'remarks', 'notitie', 'info']);
      const statusIdx = findIdx(['status', 'staat', 'conditie']);

      const currentInventory = [...inventory];
      let addedCount = 0;
      let updatedCount = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 1) continue;

        const name = (nameIdx !== -1 ? row[nameIdx] : null) || `${brandIdx !== -1 ? row[brandIdx] : ''} ${modelIdx !== -1 ? row[modelIdx] : ''}`.trim() || 'Onbekend item';
        const serial = (serialIdx !== -1 ? row[serialIdx] : null) || (invIdx !== -1 ? row[invIdx] : null) || `GS-${i}`;
        const category = (catIdx !== -1 ? row[catIdx] : null) || 'Overig';
        const description = [brandIdx !== -1 ? row[brandIdx] : '', modelIdx !== -1 ? row[modelIdx] : '', remarkIdx !== -1 ? row[remarkIdx] : ''].filter(Boolean).join(' ');

        let csvStatus = GearStatus.GOOD;
        if (statusIdx !== -1 && row[statusIdx]) {
          const val = row[statusIdx].toLowerCase().trim();
          if (val.includes('te gebruiken')) csvStatus = GearStatus.USABLE;
          else if (val.includes('kapot')) csvStatus = GearStatus.BROKEN;
          else if (val.includes('vervangen')) csvStatus = GearStatus.REPLACING;
          else if (val.includes('goed')) csvStatus = GearStatus.GOOD;
          else if (val.includes('gebruik')) csvStatus = GearStatus.RENTED;
        }

        const existingItem = currentInventory.find(item => item.name.toLowerCase() === name.toLowerCase() || (serial && item.inventoryNumber === serial));

        const itemData = {
          name,
          inventoryNumber: serial,
          category,
          description,
          status: existingItem?.status === GearStatus.RENTED ? GearStatus.RENTED : csvStatus,
          updatedAt: Timestamp.now()
        };

        if (existingItem) {
          await updateDoc(doc(db, 'inventory', existingItem.id), itemData);
          updatedCount++;
        } else {
          const newId = `gs-${Date.now()}-${i}`;
          await setDoc(doc(db, 'inventory', newId), { ...itemData, id: newId, createdAt: Timestamp.now() });
          addedCount++;
        }
      }
      
      setTimeout(() => alert(`Sync voltooid! ${addedCount} nieuw, ${updatedCount} bijgewerkt.`), 100);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Fout bij synchronisatie.");
    } finally {
      setIsSyncing(false);
    }
  };

  const addProject = async (project: Project) => {
    try {
      await setDoc(doc(db, 'projects', project.id), project);
      setPreFilledDetails(null);
      setEditingProject(null);
      setActiveTab('PROJECTS');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'projects');
    }
  };

  const updateProject = async (updatedProject: Project) => {
    try {
      await setDoc(doc(db, 'projects', updatedProject.id), updatedProject);
      setEditingProject(null);
      setPreFilledDetails(null);
      setActiveTab('PROJECTS');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${updatedProject.id}`);
    }
  };

  const startEditProject = (project: Project, isDuplicate: boolean = false) => {
    setEditingProject(isDuplicate ? null : project);
    setViewingProject(null); 
    const startDate = new Date(project.startDate);
    const endDate = new Date(project.endDate);
    
    const formatDate = (d: Date) => {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const formatTime = (d: Date) => {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    setPreFilledDetails({
      id: isDuplicate ? `gs-dup-${Date.now()}` : project.id,
      name: isDuplicate ? `${project.name} (Kopie)` : project.name,
      client: project.client,
      startDate: formatDate(startDate),
      startTime: formatTime(startDate),
      endDate: formatDate(endDate),
      endTime: formatTime(endDate),
      gearIds: project.gearIds || [],
      externalGear: project.externalGear || []
    });
    setActiveTab('PREP');
  };

  const deleteProject = async (projectId: string) => {
    try {
      await deleteDoc(doc(db, 'projects', projectId));
      // Reset statuses of items linked to this project
      const linkedItems = inventory.filter(i => i.currentProjectId === projectId);
      for (const item of linkedItems) {
        await updateDoc(doc(db, 'inventory', item.id), { status: GearStatus.GOOD, currentProjectId: null });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${projectId}`);
    }
  };

  const deleteShoot = async (shootId: string) => {
    if (!window.confirm("Weet je zeker dat je deze shoot wilt verwijderen?")) return;
    try {
      await deleteDoc(doc(db, 'shoots', shootId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `shoots/${shootId}`);
    }
  };

  if (printMode.active && printMode.projectId) {
    const project = projects.find(p => p.id === printMode.projectId);
    if (project) {
      return (
        <div className="bg-white text-black min-h-screen p-8">
           <PrintOnlyPakbon project={project} inventory={inventory} />
        </div>
      );
    }
    if (loading) return <div className="bg-white p-8">Laden...</div>;
    return <div className="bg-white p-8 text-red-600">Project niet gevonden of nog niet geladen. Zorg dat je bent ingelogd in het hoofdvenster.</div>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center border-white/10 bg-neutral-950">
          <div className="bg-[#e61e1e] text-white px-6 py-2 transform -skew-x-12 inline-block mb-8">
            <span className="font-black text-4xl tracking-tighter italic block transform skew-x-12">SMASH</span>
          </div>
          <h1 className="text-2xl font-bold mb-4">Gear Management</h1>
          <p className="text-neutral-400 mb-8 text-sm">Log in met je Smash Studios account om de inventaris te beheren.</p>
          <Button onClick={handleLogin} className="w-full h-12 bg-white text-black hover:bg-neutral-200 gap-3">
             <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
             Inloggen met Google
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white/20 print:bg-white print:text-black">
      {/* Navbar - Desktop */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10 hidden md:block print:hidden">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('DASHBOARD')}>
             <div className="bg-[#e61e1e] text-white px-3 py-1 transform -skew-x-12 select-none hover:scale-105 transition-transform">
                <span className="font-black text-2xl tracking-tighter italic block transform skew-x-12">SMASH</span>
             </div>
             <span className="font-bold text-xl tracking-tight text-neutral-300">GEAR</span>
          </div>
          
        <div className="flex items-center gap-1">
            <NavButton active={activeTab === 'DASHBOARD'} onClick={() => setActiveTab('DASHBOARD')} icon={<LayoutDashboard size={18} />}>Dashboard</NavButton>
            <NavButton active={activeTab === 'SHOOTS'} onClick={() => setActiveTab('SHOOTS')} icon={<CalendarIcon size={18} />}>Agenda</NavButton>
            <NavButton active={activeTab === 'INVENTORY'} onClick={() => setActiveTab('INVENTORY')} icon={<Package size={18} />}>Inventaris</NavButton>
            <NavButton active={activeTab === 'PROJECTS'} onClick={() => setActiveTab('PROJECTS')} icon={<Briefcase size={18} />}>Projecten</NavButton>
            <div className="w-px h-6 bg-white/10 mx-2" />
            <Button onClick={() => { 
              setPreFilledDetails(null); 
              setEditingProject(null);
              setActiveTab('PREP'); 
            }} className="bg-white text-black border border-black hover:bg-neutral-200 mr-2">
              <Plus size={18} />
              Nieuwe Prep
            </Button>
            <Button variant="secondary" onClick={logout} className="bg-neutral-800 text-neutral-400 border-none hover:text-white" title="Uitloggen">
              <LogOut size={18} />
            </Button>
          </div>
        </div>
      </nav>

      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10 md:hidden flex items-center justify-between px-6 h-16 print:hidden">
        <div className="flex items-center gap-2" onClick={() => setActiveTab('DASHBOARD')}>
           <div className="bg-[#e61e1e] text-white px-2 py-0.5 transform -skew-x-12 select-none italic font-black text-lg">
              <span className="block transform skew-x-12">SMASH</span>
           </div>
           <span className="font-bold text-lg tracking-tight text-neutral-300">GEAR</span>
        </div>
        <button 
          onClick={() => {
            setPreFilledDetails(null); 
            setEditingProject(null);
            setActiveTab('PREP');
          }}
          className="bg-red-600 p-2 rounded-full text-white shadow-lg shadow-red-600/30 active:scale-95 transition-transform"
        >
          <Plus size={20} />
        </button>
      </header>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/90 backdrop-blur-xl border-t border-white/10 md:hidden flex items-center justify-around h-16 pb-safe print:hidden">
        <MobileNavButton active={activeTab === 'DASHBOARD'} onClick={() => setActiveTab('DASHBOARD')} icon={<LayoutDashboard size={20} />} label="Home" />
        <MobileNavButton active={activeTab === 'SHOOTS'} onClick={() => setActiveTab('SHOOTS')} icon={<CalendarIcon size={20} />} label="Agenda" />
        <MobileNavButton active={activeTab === 'INVENTORY'} onClick={() => setActiveTab('INVENTORY')} icon={<Package size={20} />} label="Gear" />
        <MobileNavButton active={activeTab === 'PROJECTS'} onClick={() => setActiveTab('PROJECTS')} icon={<Briefcase size={20} />} label="Projecten" />
      </nav>

      {/* Main Content */}
      <main className="pt-20 md:pt-24 pb-20 md:pb-12 px-4 md:px-6 max-w-7xl mx-auto min-h-[calc(100vh-6rem)]">
        {activeTab === 'DASHBOARD' && (
          <DashboardView 
            inventory={inventory} 
            projects={projects} 
            onViewProject={(proj) => setViewingProject(proj)}
            onEditGear={(proj) => startEditProject(proj)}
          />
        )}
        
        {activeTab === 'SHOOTS' && (
          <ShootsView 
            shoots={shoots}
            projects={projects}
            onDeleteShoot={deleteShoot}
            onSyncCalendar={fetchGoogleCalendarEvents}
            isSyncing={isSyncing}
            onAddShoot={() => setShowAddShootModal(true)}
            onViewProject={(id) => {
              const proj = projects.find(p => p.id === id);
              if (proj) setViewingProject(proj);
            }}
            onEditProject={(id) => {
              const proj = projects.find(p => p.id === id);
              if (proj) startEditProject(proj);
            }}
            onStartPrep={(details) => {
              setPreFilledDetails(details);
              setEditingProject(null);
              setActiveTab('PREP');
            }} 
          />
        )}
        
        {activeTab === 'INVENTORY' && (
          <InventoryView 
            inventory={inventory} 
            projects={projects}
            onDelete={() => {}} // Dummy as it was removed from UI
            onSync={syncGearFromSheet}
            onClear={clearInventory}
            googleSheetUrl={googleSheetUrl}
            setGoogleSheetUrl={setGoogleSheetUrl}
            googleCalendarId={googleCalendarId}
            setGoogleCalendarId={setGoogleCalendarId}
            isSyncing={isSyncing}
          />
        )}
        
        {activeTab === 'PREP' && (
          <PrepStation 
            inventory={inventory} 
            shoots={shoots}
            projects={projects}
            onSave={editingProject ? (p) => updateProject({...p, id: editingProject.id}) : addProject} 
            onCancel={() => {
              setActiveTab(editingProject ? 'PROJECTS' : 'DASHBOARD');
              setEditingProject(null);
            }} 
            initialDetails={preFilledDetails}
            isEditing={!!editingProject}
          />
        )}
        
        {activeTab === 'PROJECTS' && (
          <ProjectsView 
            projects={projects} 
            inventory={inventory} 
            onDelete={deleteProject}
            onView={(project) => setViewingProject(project)}
            onEditGear={(project) => startEditProject(project)}
            onDuplicate={(project) => startEditProject(project, true)}
            initialViewProjectId={viewingProjectIdFromAgenda}
          />
        )}
      </main>

      {/* Modals */}
      {viewingProject && (
        <ProjectDetailModal 
          project={viewingProject} 
          inventory={inventory} 
          onClose={() => setViewingProject(null)} 
          onEditGear={(project) => startEditProject(project)}
        />
      )}

      {showAddShootModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto">
          <Card className="w-full max-w-lg animate-scale-up">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold uppercase italic flex items-center gap-2">
                <CalendarIcon className="text-red-500" /> Shoot Manueel Toevoegen
              </h2>
              <button onClick={() => setShowAddShootModal(false)} className="text-neutral-500 hover:text-white"><X size={24} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-1.5 block">Titel Shoot / Project</label>
                <Input 
                  placeholder="Bijv: Shoot Nike - Locatie X" 
                  value={newShootData.summary}
                  onChange={e => setNewShootData({...newShootData, summary: e.target.value})}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-1.5 block">Klant / Locatie</label>
                <Input 
                  placeholder="Bijv: Client Name / Amsterdam" 
                  value={newShootData.location}
                  onChange={e => setNewShootData({...newShootData, location: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-1.5 block">Start Datum</label>
                  <Input type="date" value={newShootData.startDate} onChange={e => setNewShootData({...newShootData, startDate: e.target.value, endDate: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-1.5 block">Start Tijd</label>
                  <Input type="time" value={newShootData.startTime} onChange={e => setNewShootData({...newShootData, startTime: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-1.5 block">Eind Datum</label>
                  <Input type="date" value={newShootData.endDate} onChange={e => setNewShootData({...newShootData, endDate: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-1.5 block">Eind Tijd</label>
                  <Input type="time" value={newShootData.endTime} onChange={e => setNewShootData({...newShootData, endTime: e.target.value})} />
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <Button variant="secondary" onClick={() => setShowAddShootModal(false)} className="flex-1">Annuleren</Button>
                <Button 
                  onClick={handleAddManualShoot} 
                  disabled={isSyncing}
                  className="flex-1 bg-[#e61e1e] text-white hover:bg-red-600 shadow-[0_10px_20px_-5px_rgba(230,30,30,0.3)]"
                >
                  {isSyncing ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                  Shoot Opslaan
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// --- Sub Components ---

const NavButton = ({ active, onClick, children, icon }: any) => (
  <button 
    onClick={onClick}
    className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
      active ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'
    }`}
  >
    {icon}
    {children}
  </button>
);

const MobileNavButton = ({ active, onClick, icon, label }: any) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all ${
      active ? 'text-red-500' : 'text-neutral-500'
    }`}
  >
    <div className={`p-1.5 rounded-xl transition-all ${active ? 'bg-red-500/10' : ''}`}>
      {icon}
    </div>
    <span className="text-[10px] font-medium uppercase tracking-widest">{label}</span>
  </button>
);

// --- MODALS ---

const ProjectDetailModal = ({ project, inventory, onClose, onEditGear }: { project: Project, inventory: GearItem[], onClose: () => void, onEditGear: (p: Project) => void }) => {
  // Reuse the logic from PrepStation Step 3 to show a manifest
  const projectItems = inventory.filter(item => project.gearIds.includes(item.id));
  const groupedItems: Record<string, GearItem[]> = {};
  
  projectItems.forEach(item => {
    if (!groupedItems[item.category]) groupedItems[item.category] = [];
    groupedItems[item.category].push(item);
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md overflow-y-auto p-0 sm:p-4 animate-fade-in print:p-0 print:bg-white print:block">
       <div className="w-full h-full sm:h-auto sm:max-w-3xl bg-white text-black sm:rounded-xl shadow-2xl overflow-hidden relative min-h-screen sm:min-h-[60vh] flex flex-col print:shadow-none print:rounded-none print:max-w-full">
          <button onClick={onClose} className="absolute right-4 top-4 bg-black/5 hover:bg-black/10 text-black p-2 rounded-full z-20 print:hidden transition-colors"><X size={18} /></button>
          
          <div className="p-5 pt-12 sm:pt-5 border-b-2 border-black bg-neutral-50 print:p-4">
              <div className="flex justify-between items-start mb-2">
                <h1 className="text-xl font-black italic tracking-tighter transform -skew-x-6 uppercase">SMASHGEAR</h1>
                <div className="text-right text-[9px] font-mono text-neutral-400 hidden sm:block">ID: {project.id}</div>
              </div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 sm:gap-0">
                <div>
                   <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-0.5">Project Pakbon</div>
                   <div className="text-lg font-black leading-tight border-l-4 border-[#e61e1e] pl-3">{project.name}</div>
                   <div className="text-xs text-neutral-600 pl-4">{project.client}</div>
                </div>
                <div className="text-left sm:text-right font-mono text-[9px] sm:text-[10px] space-y-0.5 text-neutral-500">
                   <div>START: {new Date(project.startDate).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</div>
                   <div>EIND: {new Date(project.endDate).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</div>
                </div>
              </div>
          </div>

          <div className="p-5 flex-1 overflow-y-auto bg-white print:p-4 text-black">
            {project.externalGear && project.externalGear.length > 0 && (
              <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-lg">
                <h3 className="font-bold text-[11px] uppercase border-b border-red-200 mb-2 pb-0.5 flex items-center gap-2 text-red-500">
                  <ShoppingBag size={14} />
                  Extern Huren (Wishlist)
                </h3>
                
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-red-300 border-b border-red-100">
                         <th className="pb-1 font-medium">ITEM</th>
                         <th className="pb-1 font-medium">VENDOR</th>
                         <th className="pb-1 font-medium">OPHALEN</th>
                         <th className="pb-1 font-medium">RETOUR</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {project.externalGear.map(item => (
                        <tr key={item.id} className="border-b border-red-50/50 last:border-0 hover:bg-red-100/30 transition-colors">
                           <td className="py-2 text-black font-bold uppercase">{item.name}</td>
                           <td className="py-2 text-neutral-500">{item.vendor || '-'}</td>
                           <td className="py-2 text-neutral-600">{item.pickupDate}</td>
                           <td className="py-2 text-neutral-600">{item.returnDate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile list */}
                <div className="sm:hidden space-y-3">
                  {project.externalGear.map(item => (
                    <div key={item.id} className="bg-white/50 p-2 rounded border border-red-100 font-mono text-[10px]">
                      <div className="font-bold text-black uppercase mb-1">{item.name}</div>
                      <div className="grid grid-cols-2 gap-1 text-neutral-500">
                        <div>V: {item.vendor || '-'}</div>
                        <div className="text-right">H: {item.pickupDate}</div>
                        <div className="col-span-2 text-right">R: {item.returnDate}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(groupedItems).length === 0 && (!project.externalGear || project.externalGear.length === 0) ? (
                <div className="text-center py-8 text-neutral-400 italic text-sm">Geen items in dit project.</div>
              ) : (
                Object.entries(groupedItems).map(([cat, items]) => (
                  <div key={cat} className="mb-5 last:mb-0">
                    <h3 className="font-bold text-[11px] uppercase border-b border-black/10 mb-2 pb-0.5 flex items-center gap-2 text-neutral-400">
                      <span className="w-1.5 h-1.5 bg-[#e61e1e] rounded-full"></span>
                      {cat}
                    </h3>

                    {/* Desktop table */}
                    <div className="hidden sm:block">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-left text-neutral-400 border-b border-neutral-100">
                             <th className="pb-1 font-medium w-28">ID / SERIAL</th>
                             <th className="pb-1 font-medium">OMSCHRIJVING</th>
                             <th className="pb-1 font-medium text-right w-16">STATUS</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          {items.map(item => (
                            <tr key={item.id} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50 transition-colors">
                               <td className="py-1 text-neutral-500">{item.inventoryNumber}</td>
                               <td className="py-1 font-bold text-neutral-800">{item.name}</td>
                               <td className="py-1 text-[9px] uppercase text-right text-neutral-400">{item.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile list */}
                    <div className="sm:hidden space-y-2">
                       {items.map(item => (
                         <div key={item.id} className="flex justify-between items-center py-2 border-b border-neutral-50 font-mono text-[10px]">
                           <div>
                             <div className="font-bold text-neutral-800">{item.name}</div>
                             <div className="text-neutral-400">{item.inventoryNumber}</div>
                           </div>
                           <div className="text-[8px] uppercase text-neutral-400">{item.status}</div>
                         </div>
                       ))}
                    </div>
                  </div>
                ))
              )}
          </div>
          
          <div className="p-5 border-t border-black/5 flex flex-col sm:flex-row gap-3 print:hidden bg-neutral-50 sticky bottom-0 z-10 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
             <div className="flex gap-2 flex-1">
               <Button 
                  onClick={() => {
                    const printUrl = window.location.origin + `?print=true&projectId=${project.id}`;
                    window.open(printUrl, '_blank');
                  }}
                  className="flex-[1.5] bg-[#e61e1e] text-white border-none hover:bg-red-600 shadow-[0_10px_20px_-5px_rgba(230,30,30,0.3)] transition-all transform hover:-translate-y-0.5 active:translate-y-0"
               >
                 <Printer size={18} /> <span className="ml-2 font-bold uppercase tracking-tight">Printen / Opslaan als PDF</span>
               </Button>
               <Button 
                  variant="secondary"
                  onClick={() => {
                    onEditGear(project);
                    onClose();
                  }}
                  className="flex-1 border-neutral-200"
               >
                 <RefreshCw size={16} /> <span className="ml-2">Gear Aanpassen</span>
               </Button>
             </div>
             <Button 
                onClick={onClose} 
                variant="secondary"
                className="w-full sm:w-auto px-8 border-neutral-200 font-bold"
             >
               Sluiten
             </Button>
          </div>

       </div>
    </div>
  );
};

const PrintOnlyPakbon = ({ project, inventory }: { project: Project, inventory: GearItem[] }) => {
  useEffect(() => {
    // Only trigger print if data is loaded
    if (project && inventory.length > 0) {
      setTimeout(() => {
        window.print();
      }, 1000);
    }
  }, [project, inventory]);

  const projectItems = inventory.filter(item => project.gearIds.includes(item.id));
  const groupedItems: Record<string, GearItem[]> = {};
  
  projectItems.forEach(item => {
    if (!groupedItems[item.category]) groupedItems[item.category] = [];
    groupedItems[item.category].push(item);
  });

  return (
    <div className="max-w-4xl mx-auto bg-white text-black p-0">
      <div className="border-b-4 border-black pb-6 mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase mb-2">SMASHGEAR</h1>
          <div className="text-sm font-bold uppercase tracking-widest text-neutral-500">Project Pakbon</div>
          <div className="text-2xl font-black uppercase mt-1">{project.name}</div>
          <div className="text-lg text-neutral-600">{project.client}</div>
        </div>
        <div className="text-right font-mono text-sm space-y-1">
          <div>ID: {project.id}</div>
          <div className="font-bold">VAN: {new Date(project.startDate).toLocaleString('nl-NL')}</div>
          <div className="font-bold">TOT: {new Date(project.endDate).toLocaleString('nl-NL')}</div>
        </div>
      </div>

      <div className="space-y-8">
        {project.externalGear && project.externalGear.length > 0 && (
          <div className="p-4 border-2 border-red-200 rounded-lg">
            <h3 className="font-black text-sm uppercase mb-4 flex items-center gap-2 text-red-600 border-b border-red-100 pb-2">
              <ShoppingBag size={18} /> EXTERN HUREN / WISHLIST
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b-2 border-red-50 text-red-400">
                  <th className="py-2">ITEM</th>
                  <th className="py-2">VENDOR</th>
                  <th className="py-2">AFHAAL</th>
                  <th className="py-2">RETOUR</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {project.externalGear.map(item => (
                  <tr key={item.id} className="border-b border-red-50">
                    <td className="py-3 font-bold">{item.name}</td>
                    <td className="py-3">{item.vendor || '-'}</td>
                    <td className="py-3">{item.pickupDate}</td>
                    <td className="py-3">{item.returnDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {Object.entries(groupedItems).map(([cat, items]) => (
          <div key={cat} className="break-inside-avoid">
            <h3 className="font-black text-sm uppercase bg-neutral-100 p-2 mb-2 border-l-4 border-red-600">
              {cat}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-400 border-b-2 border-neutral-100">
                  <th className="py-2 w-40">SERIAL / ID</th>
                  <th className="py-2">ITEM NAAM</th>
                  <th className="py-2 text-right">STATUS</th>
                </tr>
              </thead>
              <tbody className="font-mono font-bold">
                {items.map(item => (
                  <tr key={item.id} className="border-b border-neutral-50 italic">
                    <td className="py-2 text-neutral-500">{item.inventoryNumber}</td>
                    <td className="py-2">{item.name}</td>
                    <td className="py-2 text-right text-[10px] text-neutral-400 uppercase">{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="mt-12 pt-8 border-t-2 border-neutral-100 flex justify-between items-start text-[10px] uppercase font-bold text-neutral-300">
         <div>SMASH STUDIOS GEARENVY SYSTEM</div>
         <div>GEPRINT OP: {new Date().toLocaleString()}</div>
      </div>
    </div>
  );
};

// --- DASHBOARD ---
const DashboardView = ({ 
  inventory, 
  projects,
  onViewProject,
  onEditGear
}: { 
  inventory: GearItem[], 
  projects: Project[],
  onViewProject: (p: Project) => void,
  onEditGear: (p: Project) => void
}) => {
  const now = new Date();
  const currentlyRentedGearIds = new Set(
    projects
      .filter(p => new Date(p.startDate) <= now && new Date(p.endDate) >= now)
      .flatMap(p => p.gearIds)
  );

  const stats = {
    total: inventory.length,
    available: inventory.filter(i => 
      (i.status === GearStatus.GOOD || i.status === GearStatus.USABLE) && 
      !currentlyRentedGearIds.has(i.id)
    ).length,
    rented: inventory.filter(i => currentlyRentedGearIds.has(i.id)).length,
    maintenance: inventory.filter(i => i.status === GearStatus.BROKEN).length,
  };

  // Current active projects (status: ACTIVE or PREP)
  const activeProjects = [...projects]
    .filter(p => p.status === 'ACTIVE' || p.status === 'PREP')
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const projectsToday = activeProjects.filter(p => {
    try {
      const pDate = new Date(p.startDate);
      const pDateStr = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}-${String(pDate.getDate()).padStart(2, '0')}`;
      return pDateStr === todayStr;
    } catch {
      return false;
    }
  });

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in pb-20 md:pb-0">
      {/* Today's Overview if multiple projects exist */}
      {projectsToday.length > 1 && (
        <div className="bg-[#e61e1e]/10 border border-[#e61e1e]/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-slide-in">
          <div className="flex items-center gap-3 w-full sm:w-auto">
             <div className="p-2 bg-[#e61e1e] rounded-lg text-white shrink-0">
                <AlertCircle size={20} />
             </div>
             <div>
                <div className="font-bold text-white text-sm md:text-base">Drukke dag!</div>
                <div className="text-[10px] md:text-xs text-neutral-400">Er staan {projectsToday.length} projecten gepland voor vandaag.</div>
             </div>
          </div>
          <Button 
            variant="ghost" 
            onClick={() => (document.getElementById('lopende-projecten') as HTMLElement)?.scrollIntoView({ behavior: 'smooth' })} 
            className="text-[10px] md:text-xs w-full sm:w-auto bg-white/5 md:bg-transparent"
          >
            Bekijk alles
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Totaal Items" value={stats.total} icon={<Package className="text-neutral-500" />} />
        <StatCard label="Beschikbaar" value={stats.available} icon={<CheckCircle2 className="text-green-500" />} />
        <StatCard label="In Gebruik" value={stats.rented} icon={<Briefcase className="text-blue-500" />} />
        <StatCard label="Onderhoud" value={stats.maintenance} icon={<AlertCircle className="text-orange-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <Card id="lopende-projecten" className="lg:col-span-2 h-full">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <LayoutGrid size={20} className="text-neutral-400" />
            Lopende Projecten
          </h2>
          {activeProjects.length === 0 ? (
            <div className="text-neutral-500 text-sm py-8 text-center bg-white/5 rounded-xl border border-dashed border-white/10">
              Geen actieve projecten op dit moment.
            </div>
          ) : (
            <div className="space-y-3">
              {activeProjects.map(project => (
                <div 
                  key={project.id} 
                  className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/20 transition-all cursor-pointer group"
                  onClick={() => onViewProject(project)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-1 h-8 rounded-full ${project.status === 'ACTIVE' ? 'bg-blue-500' : 'bg-green-500'}`} />
                    <div>
                      <div className="font-bold text-white group-hover:text-[#e61e1e] transition-colors">{project.name}</div>
                      <div className="text-xs text-neutral-400">{project.client}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                      <div className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Periode</div>
                      <div className="text-xs font-mono text-neutral-300">
                        {new Date(project.startDate).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' })} - {new Date(project.endDate).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' })}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewProject(project);
                        }}
                        className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-400 hover:text-white transition-all shadow-sm"
                        title="Pakbon bekijken"
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditGear(project);
                        }}
                        className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-400 hover:text-white transition-all shadow-sm"
                        title="Gear aanpassen"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="h-full border-orange-500/20 bg-orange-500/5">
          <h2 className="text-lg font-semibold mb-4 text-orange-400 flex items-center gap-2">
             <AlertCircle size={20} />
             Onderhoud Nodig
          </h2>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
             {inventory.filter(i => i.status === GearStatus.BROKEN).map(item => (
                <div key={item.id} className="p-3 bg-black/40 rounded-xl border border-orange-500/10 flex justify-between items-start">
                   <div className="flex items-center gap-3">
                      <div className="p-2 bg-neutral-800 rounded-lg">
                        {getCategoryIcon(item.category)}
                      </div>
                      <div>
                        <div className="font-medium text-neutral-200 text-sm">{item.name}</div>
                        <div className="text-[10px] text-orange-400/80 uppercase font-mono">{item.inventoryNumber}</div>
                      </div>
                   </div>
                   <Badge status={item.status} />
                </div>
             ))}
             {inventory.filter(i => i.status === GearStatus.BROKEN).length === 0 && (
                <div className="text-neutral-500 text-sm py-10 text-center">Alles functioneert naar behoren.</div>
             )}
          </div>
        </Card>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, icon }: any) => (
  <Card className="flex items-center justify-between p-4 md:p-6">
    <div>
      <div className="text-neutral-400 text-[10px] md:text-xs font-medium uppercase tracking-wider mb-0.5 md:mb-1">{label}</div>
      <div className="text-xl md:text-3xl font-bold tracking-tight">{value}</div>
    </div>
    <div className="p-2 md:p-3 bg-white/5 rounded-xl md:rounded-2xl border border-white/5 scale-90 md:scale-100">{icon}</div>
  </Card>
);

// --- PREP STATION (WIZARD) ---
const PrepStation = ({ inventory, shoots, projects, onSave, onCancel, initialDetails, isEditing }: { inventory: GearItem[], shoots: CalendarEvent[], projects: Project[], onSave: (p: Project) => void, onCancel: () => void, initialDetails?: any, isEditing?: boolean }) => {
  const [step, setStep] = useState(isEditing ? 2 : 1); 
  const [details, setDetails] = useState({ 
    name: initialDetails?.name || '', 
    client: initialDetails?.client || '', 
    startDate: initialDetails?.startDate || '', 
    endDate: initialDetails?.endDate || '',
    startTime: initialDetails?.startTime || '09:00',
    endTime: initialDetails?.endTime || '18:00'
  });
  const [selectedGear, setSelectedGear] = useState<Set<string>>(new Set(initialDetails?.gearIds || []));
  const [externalGear, setExternalGear] = useState<ExternalGear[]>(initialDetails?.externalGear || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [newExternalItem, setNewExternalItem] = useState({ name: '', quantity: 1, vendor: '', pickupDate: details.startDate, returnDate: details.endDate });
  
  const getConflictInfo = useCallback((itemId: string) => {
    if (!details.startDate || !details.endDate || !details.startTime || !details.endTime) return { available: true };
    
    try {
      const currentStart = new Date(`${details.startDate}T${details.startTime}`).getTime();
      const currentEnd = new Date(`${details.endDate}T${details.endTime}`).getTime();
      
      if (isNaN(currentStart) || isNaN(currentEnd)) return { available: true };
      
      // Check projects
      const conflict = projects.find(p => {
        if (isEditing && initialDetails?.id === p.id) return false;
        if (!p.gearIds.includes(itemId)) return false;
        
        const pStart = new Date(p.startDate).getTime();
        const pEnd = new Date(p.endDate).getTime();
        
        if (isNaN(pStart) || isNaN(pEnd)) return false;
        return currentStart < pEnd && currentEnd > pStart;
      });

      if (conflict) {
        return { available: false, conflictType: 'PROJECT', conflictName: conflict.name };
      }

      return { available: true };
    } catch (e) {
      return { available: true };
    }
  }, [details.startDate, details.endDate, details.startTime, details.endTime, projects, inventory, isEditing, initialDetails?.id]);

  // Re-sync if initialDetails changes (important for editing)
  useEffect(() => {
    if (initialDetails) {
      setDetails({
        name: initialDetails.name || '',
        client: initialDetails.client || '',
        startDate: initialDetails.startDate || '',
        endDate: initialDetails.endDate || '',
        startTime: initialDetails.startTime || '09:00',
        endTime: initialDetails.endTime || '18:00'
      });
      if (initialDetails.gearIds) {
        setSelectedGear(new Set(initialDetails.gearIds));
      }
      if (initialDetails.externalGear) {
        setExternalGear(initialDetails.externalGear);
      }
    }
  }, [initialDetails]);

  const categories = useMemo(() => ['All', ...Array.from(new Set(inventory.map(i => i.category)))], [inventory]);

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.inventoryNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleGear = (id: string) => {
    const newSet = new Set(selectedGear);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedGear(newSet);
  };

  const handleSave = () => {
    // Robustly assemble local date/time strings to avoid UTC-midnight interpretation issues
    const assembleISO = (dateStr: string, timeStr: string) => {
      if (!dateStr) return new Date().toISOString();
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = (timeStr || '09:00').split(':').map(Number);
      const d = new Date(year, month - 1, day, hours, minutes);
      return d.toISOString();
    };

    const startDateTime = assembleISO(details.startDate, details.startTime);
    const endDateTime = assembleISO(details.endDate, details.endTime);

    const newProject: Project = {
      id: initialDetails?.id || Date.now().toString(),
      name: details.name,
      client: details.client,
      startDate: startDateTime,
      endDate: endDateTime,
      gearIds: Array.from(selectedGear),
      externalGear: externalGear,
      status: initialDetails?.status || 'ACTIVE'
    };
    onSave(newProject);
    onCancel();
  };

  const selectEvent = (evt: CalendarEvent) => {
    const startStr = evt.start.dateTime || evt.start.date;
    const endStr = evt.end.dateTime || evt.end.date;
    
    if (!startStr) return;
    
    const start = new Date(startStr);
    const end = endStr ? new Date(endStr) : new Date(start.getTime() + 3600000);

    const toLocalDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const toLocalTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    setDetails({
      name: evt.summary,
      client: evt.location || '',
      startDate: toLocalDate(start),
      startTime: evt.start.dateTime ? toLocalTime(start) : '09:00',
      endDate: toLocalDate(end),
      endTime: evt.end.dateTime ? toLocalTime(end) : '18:00',
    });
  };

  const addExternalItem = () => {
    if (!newExternalItem.name) return;
    const item: ExternalGear = {
      id: Date.now().toString(),
      name: newExternalItem.name,
      quantity: Number(newExternalItem.quantity) || 1,
      vendor: newExternalItem.vendor,
      pickupDate: newExternalItem.pickupDate,
      returnDate: newExternalItem.returnDate,
      status: 'PENDING'
    };
    setExternalGear([...externalGear, item]);
    setNewExternalItem({ ...newExternalItem, name: '', quantity: 1, vendor: '' });
    setShowExternalForm(false);
  };

  const removeExternalItem = (id: string) => {
    setExternalGear(externalGear.filter(i => i.id !== id));
  };

  const renderContent = () => {
    if (step === 1) {
      return (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold">Stap 1: Project & Agenda</h2>
            <StepIndicator current={1} total={3} />
          </div>
          {/* ... Step 1 Content ... */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Smart Agenda List */}
            <div className="space-y-4">
               <h3 className="text-lg font-semibold flex items-center gap-2">
                 <CalendarIcon className="text-red-500" size={20} /> 
                 Beschikbare Opnames
               </h3>
               <div className="space-y-3">
                 {shoots.length > 0 ? shoots.map(evt => (
                   <div 
                    key={evt.id} 
                    onClick={() => selectEvent(evt)}
                    className="group cursor-pointer p-4 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-red-500/50 hover:bg-neutral-800 transition-all"
                   >
                      <div className="text-sm text-red-400 font-medium mb-1">
                        {new Date(evt.start.dateTime || evt.start.date || Date.now()).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} • {evt.start.dateTime ? new Date(evt.start.dateTime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : 'Hele dag'}
                      </div>
                      <div className="font-semibold text-white group-hover:text-red-400 transition-colors">{evt.summary}</div>
                      {evt.location && (
                        <div className="text-xs text-neutral-500 flex items-center gap-1 mt-2">
                          <MapPin size={12} /> {evt.location}
                        </div>
                      )}
                   </div>
                 )) : (
                   <div className="p-8 text-center bg-neutral-900/50 border border-dashed border-neutral-800 rounded-xl text-neutral-500 text-sm">
                     Geen opnames gevonden in agenda
                   </div>
                 )}
                 <div className="text-xs text-neutral-600 text-center pt-2">
                   * Selecteer een item om gegevens over te nemen
                 </div>
               </div>
            </div>
            {/* Form */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <h3 className="text-lg font-semibold mb-6 border-b border-white/10 pb-4">Project Details</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5 block">Project Naam</label>
                      <Input 
                        placeholder="Bijv. Commercial Nike" 
                        value={details.name} 
                        onChange={e => setDetails({...details, name: e.target.value})} 
                        autoFocus
                      />
                    </div>
                    <div className="col-span-2">
                       <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5 block">Locatie / Klant</label>
                       <Input 
                        placeholder="Bijv. Amsterdam / Nike" 
                        value={details.client} 
                        onChange={e => setDetails({...details, client: e.target.value})} 
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5 block">Start Datum</label>
                      <Input type="date" value={details.startDate} onChange={e => setDetails({...details, startDate: e.target.value, endDate: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5 block">Start Tijd</label>
                      <Input type="time" value={details.startTime} onChange={e => setDetails({...details, startTime: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5 block">Eind Datum</label>
                      <Input type="date" value={details.endDate} onChange={e => setDetails({...details, endDate: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5 block">Eind Tijd</label>
                      <Input type="time" value={details.endTime} onChange={e => setDetails({...details, endTime: e.target.value})} />
                    </div>
                  </div>
                </div>
              </Card>
              <div className="flex justify-end pt-4 gap-4">
                 <Button variant="ghost" onClick={onCancel}>Annuleren</Button>
                 <Button onClick={() => setStep(2)} disabled={!details.name} className="bg-white text-black border border-black hover:bg-neutral-200 px-8">
                  Volgende: Gear Selecteren <ArrowRight size={18} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-6 h-full flex flex-col animate-fade-in">
           <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft size={18} /></Button>
              <h2 className="text-2xl font-bold">Stap 2: Gear Selecteren</h2>
            </div>
            <StepIndicator current={2} total={3} />
          </div>
          <div className="flex flex-col lg:flex-row gap-6 h-full">
             <div className="w-full lg:w-64 space-y-4 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 text-neutral-500" size={18} />
                  <Input 
                    placeholder="Zoeken..." 
                    className="pl-10"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-4 py-3 rounded-xl text-left text-sm font-medium transition-all flex items-center gap-3 whitespace-nowrap ${activeCategory === cat ? 'bg-neutral-800 text-white border border-neutral-700 shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'}`}
                    >
                      {cat !== 'All' ? getCategoryIcon(cat) : <Filter size={18} />}
                      {cat === 'All' ? 'Alle Categorieën' : cat}
                    </button>
                  ))}
                </div>
                <div className="hidden lg:block pt-4 border-t border-neutral-800">
                  <div className="text-xs uppercase tracking-wider text-neutral-500 font-bold mb-3">Geselecteerd</div>
                  <div className="text-3xl font-bold text-white mb-1">{selectedGear.size}</div>
                  <div className="text-sm text-neutral-400">Items in prep lijst</div>
                  <div className="mt-8 pt-4 border-t border-neutral-800">
                    <div className="text-xs uppercase tracking-wider text-neutral-500 font-bold mb-3">Wishlist / Extern</div>
                    <div className="text-3xl font-bold text-red-500 mb-1">{externalGear.length}</div>
                    <div className="text-sm text-neutral-400">Items om te huren</div>
                    <Button onClick={() => setShowExternalForm(true)} variant="secondary" className="w-full mt-4 bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white">
                      <Plus size={16} /> Item Toevoegen
                    </Button>
                  </div>
                </div>
             </div>
             <div className="flex-1 bg-neutral-900/30 rounded-2xl border border-neutral-800 overflow-hidden flex flex-col max-h-[70vh] min-h-[400px] md:min-h-[500px]">
                <div className="grid grid-cols-12 gap-2 px-4 md:px-6 py-3 border-b border-neutral-800 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                  <div className="col-span-1"></div>
                  <div className="col-span-8 md:col-span-7">Omschrijving</div>
                  <div className="col-span-2 hidden md:block text-center">ID / Serial</div>
                  <div className="col-span-3 md:col-span-2 text-right">Status</div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                  <div className="space-y-1">
                    {externalGear.length > 0 && (
                      <div className="mb-4">
                        <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[#e61e1e] flex items-center gap-2">
                          <ShoppingBag size={12} /> Wishlist: Extern Huren
                        </div>
                        {externalGear.map(item => (
                          <div key={item.id} className="px-2 md:px-4 py-2 rounded-lg border border-red-500/20 bg-red-500/5 grid grid-cols-12 gap-2 items-center mb-1">
                            <div className="col-span-1 flex justify-center">
                              <div className="p-1 rounded-md bg-red-500 text-white">
                                <ExternalLink size={12} />
                              </div>
                            </div>
                            <div className="col-span-1 border-r border-red-500/10 h-6 flex items-center justify-center">
                              <span className="text-xs font-bold text-red-400">{item.quantity}x</span>
                            </div>
                            <div className="col-span-7 md:col-span-6">
                              <h4 className="text-sm font-semibold truncate text-white" title={item.name}>{item.name}</h4>
                              <div className="text-[10px] text-neutral-500 truncate">Bij: {item.vendor || 'N.v.t.'}</div>
                            </div>
                            <div className="col-span-2 md:col-span-3 text-[9px] font-mono text-neutral-500 text-center md:text-left">
                              <div className="flex flex-col">
                                <span className="text-red-400/60 hidden md:inline">H: {item.pickupDate}</span>
                                <span className="text-red-400/60 hidden md:inline">R: {item.returnDate}</span>
                                <span className="text-red-400/60 md:hidden">{item.pickupDate.split('-').slice(1).join('/')}</span>
                              </div>
                            </div>
                            <div className="col-span-1 text-right">
                               <button onClick={() => removeExternalItem(item.id)} className="p-1 hover:text-red-500 transition-colors">
                                 <X size={14} />
                               </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {filteredInventory.map(item => {
                      const isSelected = selectedGear.has(item.id);
                      const isFunctional = item.status === GearStatus.GOOD || item.status === GearStatus.USABLE || item.status === GearStatus.RENTED;
                      const conflictInfo = getConflictInfo(item.id);
                      const isAvailable = isFunctional && conflictInfo.available;
                      
                      return (
                        <div 
                          key={item.id} 
                          onClick={() => isAvailable && toggleGear(item.id)} 
                          className={`relative group px-2 md:px-4 py-1.5 rounded-lg border transition-all cursor-pointer select-none grid grid-cols-12 gap-2 items-center 
                            ${isSelected ? 'bg-red-500/10 border-red-500/50 shadow-[0_0_15px_rgba(230,30,30,0.05)]' : 
                              isAvailable ? 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5' : 
                              'bg-transparent border-transparent opacity-40 cursor-not-allowed'}
                          `}
                        >
                           <div className="col-span-1 flex justify-center">
                             <div className={`p-1 rounded-md ${isSelected ? 'bg-red-500 text-white' : 'bg-neutral-800 text-neutral-500'}`}>
                               {getCategoryIcon(item.category)}
                             </div>
                           </div>
                           <div className="col-span-8 md:col-span-7">
                             <h4 className={`text-sm font-medium ${isSelected ? 'text-red-100' : 'text-neutral-200'} truncate`} title={item.name}>
                               {item.name}
                             </h4>
                             {!isAvailable && conflictInfo.conflictName && (
                               <div className="text-[9px] text-orange-400 font-medium truncate">
                                 BEZET: {conflictInfo.conflictName}
                               </div>
                             )}
                             <div className="md:hidden text-[9px] text-neutral-500 font-mono">
                               {item.inventoryNumber}
                             </div>
                           </div>
                           <div className="col-span-2 hidden md:block">
                             <div className="text-[11px] text-neutral-500 font-mono tracking-tighter truncate">
                               {item.inventoryNumber}
                             </div>
                           </div>
                           <div className="col-span-3 md:col-span-2 text-right flex items-center justify-end gap-2">
                             {!isAvailable && (
                               <span className="text-[9px] text-orange-500 border border-orange-500/20 px-1 py-0.5 rounded uppercase font-mono">
                                 {!isFunctional ? item.status : 'BEZET'}
                               </span>
                             )}
                             {isSelected ? (
                               <CheckCircle2 size={16} className="text-red-500" />
                             ) : (
                               <div className="w-4 h-4 rounded border border-neutral-700" />
                             )}
                           </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
             </div>
          </div>
          <div className="flex justify-between pt-4 border-t border-white/10">
             <div className="text-neutral-500 text-sm flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-red-500"></div> Geselecteerd
               <div className="w-2 h-2 rounded-full bg-neutral-700 ml-4"></div> Beschikbaar
             </div>
             <Button onClick={() => setStep(3)} className="bg-white text-black border border-black hover:bg-neutral-200 px-8">
                Contoleren & Afronden <ArrowRight size={18} />
             </Button>
          </div>
        </div>
      );
    }

    if (step === 3) {
      const selectedItems = inventory.filter(i => selectedGear.has(i.id));
      const groupedItems: Record<string, GearItem[]> = {};
      selectedItems.forEach(item => {
        if (!groupedItems[item.category]) groupedItems[item.category] = [];
        groupedItems[item.category].push(item);
      });
      return (
        <div className="space-y-6 animate-fade-in print:animate-none pb-24">
           {/* No-Print Header */}
           <div className="flex items-center justify-between print:hidden">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft size={18} /></Button>
              <h2 className="text-2xl font-bold">Stap 3: Controleer & Print</h2>
            </div>
            <StepIndicator current={3} total={3} />
          </div>

          {/* Print View Container */}
          <div className="bg-white text-black p-4 md:p-8 rounded-none max-w-4xl mx-auto shadow-2xl print:shadow-none print:w-full print:max-w-none print:p-0">
             <div className="md:sticky md:top-20 bg-white z-10 flex flex-col sm:flex-row justify-between items-start border-b-4 border-black pb-4 md:pb-6 mb-6 md:mb-8 gap-4 sm:gap-0 transition-all print:static print:mb-8 shadow-[0_10px_20px_-10px_rgba(255,255,255,1)] md:shadow-none">
                <div>
                  <h1 className="text-3xl md:text-4xl font-black italic tracking-tighter transform -skew-x-6 uppercase mb-1 md:mb-2">SMASHGEAR</h1>
                  <div className="text-xs md:text-sm font-bold uppercase tracking-widest text-neutral-500">Equipment Manifest</div>
                </div>
                <div className="text-left sm:text-right w-full sm:w-auto">
                  <div className="text-xl md:text-2xl font-bold">{details.name}</div>
                  <div className="text-md md:text-lg text-neutral-600">{details.client}</div>
                  <div className="text-xs mt-2 font-mono">{details.startDate} {details.startTime} - {details.endDate} {details.endTime}</div>
                </div>
             </div>

             <div className="space-y-6 md:space-y-8 min-h-[400px] md:min-h-[500px]">
                {externalGear.length > 0 && (
                  <div className="break-inside-avoid mb-6 md:mb-10">
                     <h3 className="font-bold text-md md:text-lg uppercase border-b-2 border-[#e61e1e] text-[#e61e1e] mb-3 pb-1 flex items-center gap-2">
                        <ShoppingBag size={20} /> Wishlist: Extern Huren
                     </h3>
                     
                     {/* Desktop */}
                     <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-sm">
                           <thead>
                             <tr className="text-left text-neutral-500 border-b border-neutral-200">
                                <th className="pb-2 font-medium">Aantal</th>
                                <th className="pb-2 font-medium">Item Omschrijving</th>
                                <th className="pb-2 font-medium">Vendor</th>
                                <th className="pb-2 font-medium">Ophalen</th>
                                <th className="pb-2 font-medium">Retour</th>
                                <th className="pb-2 font-medium text-right w-16">Check</th>
                             </tr>
                           </thead>
                           <tbody className="font-mono">
                             {externalGear.map(item => (
                               <tr key={item.id} className="border-b border-neutral-100">
                                  <td className="py-2 font-bold">{item.quantity}x</td>
                                  <td className="py-2 font-bold">{item.name}</td>
                                  <td className="py-2 text-neutral-500">{item.vendor || '-'}</td>
                                  <td className="py-2 text-sm">{item.pickupDate}</td>
                                  <td className="py-2 text-sm">{item.returnDate}</td>
                                  <td className="py-2 text-right">
                                    <div className="w-4 h-4 border-2 border-red-500 inline-block rounded-sm"></div>
                                  </td>
                               </tr>
                             ))}
                           </tbody>
                        </table>
                     </div>

                     {/* Mobile */}
                     <div className="sm:hidden space-y-3 font-mono text-[10px]">
                        {externalGear.map(item => (
                           <div key={item.id} className="border border-red-100 p-2 rounded bg-red-50/30 flex justify-between items-start">
                              <div>
                                 <div className="font-bold text-black uppercase">{item.quantity}x {item.name}</div>
                                 <div className="text-neutral-500">V: {item.vendor || '-'}</div>
                                 <div className="text-neutral-500">H: {item.pickupDate} | R: {item.returnDate}</div>
                              </div>
                              <div className="w-4 h-4 border-2 border-red-500 rounded-sm shrink-0"></div>
                           </div>
                        ))}
                     </div>
                  </div>
                )}
                {Object.entries(groupedItems).map(([cat, items]) => (
                  <div key={cat} className="break-inside-avoid">
                    <h3 className="font-bold text-md md:text-lg uppercase border-b-2 border-black mb-3 pb-1 flex items-center gap-2">
                       <span className="w-2 h-2 bg-black rounded-full"></span>{cat}
                    </h3>

                    {/* Desktop */}
                    <div className="hidden sm:block">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-neutral-500 border-b border-neutral-200">
                             <th className="pb-2 font-medium w-24">ID</th>
                             <th className="pb-2 font-medium">Item</th>
                             <th className="pb-2 font-medium w-32 text-right">Check</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          {items.map(item => (
                            <tr key={item.id} className="border-b border-neutral-100">
                               <td className="py-2 text-neutral-500 text-xs">{item.inventoryNumber}</td>
                               <td className="py-2 font-bold">{item.name}</td>
                               <td className="py-2 text-right">
                                  <div className="w-4 h-4 border-2 border-black inline-block rounded-sm"></div>
                               </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile */}
                    <div className="sm:hidden space-y-2 font-mono text-[10px]">
                        {items.map(item => (
                           <div key={item.id} className="flex justify-between items-center py-2 border-b border-neutral-100">
                              <div>
                                 <div className="font-bold text-black uppercase">{item.name}</div>
                                 <div className="text-neutral-500">{item.inventoryNumber}</div>
                              </div>
                              <div className="w-4 h-4 border-2 border-black rounded-sm shrink-0"></div>
                           </div>
                        ))}
                    </div>
                  </div>
                ))}
             </div>

             <div className="mt-12 pt-6 border-t border-neutral-200 flex justify-between text-xs text-neutral-500">
                <div>Geprept door: ________________________</div>
                <div>Datum: {new Date().toLocaleDateString()}</div>
             </div>
          </div>
          <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-white/10 p-4 print:hidden flex justify-center gap-4 z-[110]">
             <Button 
               onClick={() => {
                 if (initialDetails?.id) {
                   const printUrl = window.location.origin + `?print=true&projectId=${initialDetails.id}`;
                   window.open(printUrl, '_blank');
                 } else {
                   alert("Sla het project eerst op voordat je het kunt printen.");
                 }
               }} 
               className="bg-white text-black border border-black hover:bg-neutral-200"
             >
               <Printer size={18} /> Printen / Opslaan als PDF
             </Button>
             <Button 
               onClick={(e) => {
                 e.preventDefault();
                 handleSave();
               }} 
               className="bg-green-600 hover:bg-green-500 text-white border-none px-12"
             >
               <Save size={18} /> Project Opslaan
             </Button>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full">
      {renderContent()}

      {/* Wishlist Modal */}
      {showExternalForm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-neutral-900 border-neutral-700 shadow-2xl animate-fade-in text-white">
            <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <ShoppingBag className="text-red-500" size={20} /> Externe Rental
              </h3>
              <button onClick={() => setShowExternalForm(false)} className="text-neutral-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
             <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5 block">Item Naam</label>
                  <Input 
                    placeholder="Bijv. ARRI Alexa 35 body" 
                    value={newExternalItem.name} 
                    onChange={e => setNewExternalItem({...newExternalItem, name: e.target.value})}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5 block">Aantal</label>
                  <Input 
                    type="number"
                    min="1"
                    value={newExternalItem.quantity} 
                    onChange={e => setNewExternalItem({...newExternalItem, quantity: parseInt(e.target.value) || 1})}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5 block">Verhuurder (Optioneel)</label>
                <Input 
                  placeholder="Bijv. Camalot / BudgetCam" 
                  value={newExternalItem.vendor} 
                  onChange={e => setNewExternalItem({...newExternalItem, vendor: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5 block">Ophaal Datum</label>
                  <Input 
                    type="date" 
                    value={newExternalItem.pickupDate} 
                    onChange={e => setNewExternalItem({...newExternalItem, pickupDate: e.target.value, returnDate: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5 block">Retour Datum</label>
                  <Input 
                    type="date" 
                    value={newExternalItem.returnDate} 
                    onChange={e => setNewExternalItem({...newExternalItem, returnDate: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="pt-4 flex gap-3">
                <Button variant="ghost" onClick={() => setShowExternalForm(false)} className="flex-1">Annuleren</Button>
                <Button onClick={addExternalItem} className="flex-1 bg-red-600 hover:bg-red-500 text-white border-none">
                  Toevoegen
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

const StepIndicator = ({ current, total }: { current: number, total: number }) => (
  <div className="flex items-center gap-2">
    {Array.from({ length: total }).map((_, i) => (
      <div 
        key={i} 
        className={`h-2 rounded-full transition-all ${i + 1 === current ? 'w-8 bg-red-600' : 'w-2 bg-neutral-800'}`} 
      />
    ))}
  </div>
);

// --- INVENTORY LIST VIEW ---
const InventoryView = ({ 
  inventory, 
  projects,
  onDelete,
  onSync,
  onClear,
  googleSheetUrl,
  setGoogleSheetUrl,
  googleCalendarId,
  setGoogleCalendarId,
  isSyncing
}: { 
  inventory: GearItem[], 
  projects: Project[],
  onDelete: (id: string) => void,
  onSync: () => void,
  onClear: () => void,
  googleSheetUrl: string,
  setGoogleSheetUrl: (url: string) => void,
  googleCalendarId: string,
  setGoogleCalendarId: (id: string) => void,
  isSyncing: boolean
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSyncBar, setShowSyncBar] = useState(false);
  const [activeCategory, setActiveCategory] = useState('Alle');

  const categories = useMemo(() => ['Alle', ...Array.from(new Set(inventory.map(i => i.category)))], [inventory]);
  
  const reservationInfo = useMemo(() => {
    const info = new Map<string, { type: 'NOW' | 'FUTURE', projectName: string }>();
    const now = new Date();
    
    projects.forEach(p => {
      const start = new Date(p.startDate);
      const end = new Date(p.endDate);
      const isCurrent = now >= start && now <= end;
      const isFuture = start > now;
      
      if (isCurrent || isFuture) {
        p.gearIds.forEach(id => {
          // If we already have a 'NOW' record, don't overwrite with 'FUTURE'
          if (info.get(id)?.type === 'NOW' && isFuture) return;
          info.set(id, { 
            type: isCurrent ? 'NOW' : 'FUTURE', 
            projectName: p.name 
          });
        });
      }
    });

    return info;
  }, [projects]);

  const filtered = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.inventoryNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'Alle' || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex-1 flex gap-2 w-full md:w-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3.5 text-neutral-500" size={18} />
            <Input 
              placeholder="Zoeken in inventaris..." 
              className="pl-10" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
          <Button 
            variant="secondary" 
            onClick={() => setShowSyncBar(!showSyncBar)}
            className={`px-3 ${showSyncBar ? 'bg-neutral-800' : ''}`}
            title="Google Sheet Link Instellingen"
          >
            <ExternalLink size={18} />
          </Button>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
          {googleSheetUrl && (
            <Button 
              onClick={onSync} 
              disabled={isSyncing}
              className="bg-blue-600/10 text-blue-400 border-blue-500/20 hover:bg-blue-600 hover:text-white flex-1 md:flex-none"
            >
              <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} /> 
              {isSyncing ? "Synchroniseren..." : "Sync Nu"}
            </Button>
          )}
        </div>
      </div>

      {showSyncBar && (
        <Card className="bg-neutral-900/50 border-white/5 animate-slide-in">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-300">Google Sheets Synchronisatie</h3>
                <p className="text-xs text-neutral-500 mt-1">Publiceer je sheet als CSV en plak de link hieronder.</p>
              </div>
              <button onClick={() => setShowSyncBar(false)} className="text-neutral-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-1 block">Google Sheet CSV URL</label>
                <Input 
                  value={googleSheetUrl} 
                  onChange={e => setGoogleSheetUrl(e.target.value)} 
                  placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv"
                  className="w-full text-xs"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-1 block">Google Calendar ID</label>
                <div className="flex gap-2">
                  <Input 
                    value={googleCalendarId} 
                    onChange={e => setGoogleCalendarId(e.target.value)} 
                    placeholder="example@gmail.com"
                    className="flex-1 text-xs"
                  />
                  <div className="flex gap-2">
                    <Button onClick={onSync} disabled={isSyncing} className="bg-white text-black border border-black hover:bg-neutral-200">
                      {isSyncing ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                      Sync Sheet
                    </Button>
                    <Button onClick={onClear} variant="danger" className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500 hover:text-white">
                      Reset
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            {!googleSheetUrl && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                 <p className="text-xs text-blue-400">
                   <strong>Tip:</strong> Heb je hulp nodig bij het vinden van de CSV link? <a href="https://support.google.com/docs/answer/183965" target="_blank" className="underline">Bekijk de uitleg</a>.
                 </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeCategory === cat 
              ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' 
              : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 border border-neutral-700/50'
            }`}
          >
            {cat !== 'Alle' && <span className="opacity-70">{getCategoryIcon(cat)}</span>}
            {cat}
          </button>
        ))}
      </div>

      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
        {/* Desktop View */}
        <div className="hidden md:block">
          <table className="w-full text-left">
            <thead className="bg-neutral-950 text-neutral-400 text-xs uppercase font-semibold tracking-wider sticky top-0 z-10 shadow-md">
              <tr>
                <th className="p-4 w-16 text-center">Type</th>
                <th className="p-4">Item Naam</th>
                <th className="p-4">Serie / ID</th>
                <th className="p-4">Categorie</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                  <td className="p-4 text-center">
                     <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center mx-auto text-neutral-400 group-hover:text-white transition-colors">
                       {getCategoryIcon(item.category)}
                     </div>
                  </td>
                  <td className="p-4 font-medium text-white">
                    {item.name}
                  </td>
                  <td className="p-4 text-neutral-400 font-mono text-sm">{item.inventoryNumber}</td>
                  <td className="p-4 text-neutral-400">
                    <span className="px-2 py-1 rounded bg-neutral-800 text-xs">{item.category}</span>
                  </td>
                  <td className="p-4">
                    {reservationInfo.get(item.id) ? (
                      <Badge 
                        status={reservationInfo.get(item.id)?.type === 'NOW' ? 'RENTED' : 'RESERVED'} 
                        label={reservationInfo.get(item.id)?.type === 'NOW' ? 'BEZET' : 'GERESERVEERD'}
                      />
                    ) : (
                      <Badge status={item.status} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-neutral-800">
          {filtered.map(item => (
            <div key={item.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-400">
                  {getCategoryIcon(item.category)}
                </div>
                <div>
                  <div className="font-medium text-white text-sm">{item.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">{item.inventoryNumber}</span>
                    <span className="w-1 h-1 rounded-full bg-neutral-700" />
                    <span className="text-[10px] text-neutral-500 uppercase">{item.category}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {reservationInfo.get(item.id) ? (
                  <Badge 
                    status={reservationInfo.get(item.id)?.type === 'NOW' ? 'RENTED' : 'RESERVED'} 
                    label={reservationInfo.get(item.id)?.type === 'NOW' ? 'BEZET' : 'GERESERVEERD'}
                  />
                ) : (
                  <Badge status={item.status} />
                )}
              </div>
            </div>
          ))}
        </div>
        
        {filtered.length === 0 && (
          <div className="p-12 text-center text-neutral-500 italic">
            Geen items gevonden die voldoen aan je zoekopdracht.
          </div>
        )}
      </div>
    </div>
  );
};

// --- PROJECTS LIST VIEW ---
const ProjectsView = ({ 
  projects, 
  inventory, 
  onDelete, 
  onView,
  onEditGear,
  onDuplicate,
  initialViewProjectId
}: { 
  projects: Project[], 
  inventory: GearItem[], 
  onDelete: (id: string) => void,
  onView: (p: Project) => void,
  onEditGear: (p: Project) => void,
  onDuplicate: (p: Project) => void,
  initialViewProjectId?: string | null
}) => {
  useEffect(() => {
    if (initialViewProjectId) {
      const proj = projects.find(p => p.id === initialViewProjectId);
      if (proj) onView(proj);
    }
  }, [initialViewProjectId, projects, onView]);
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 'Onbekend' : d.toLocaleDateString('nl-NL');
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('nl-NL', {hour: '2-digit', minute:'2-digit'});
  };

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-neutral-900/20 border border-dashed border-white/10 rounded-3xl">
        <div className="p-4 bg-neutral-800 rounded-2xl text-neutral-500 mb-4">
          <Briefcase size={40} />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Geen projecten gevonden</h3>
        <p className="text-neutral-400 max-w-md">Je hebt nog geen projecten geprept. Start een nieuwe prep om je gear te koppelen aan een shoot.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
       {projects.map(project => (
         <Card key={project.id} className="hover:border-white/20 transition-all cursor-pointer group">
            <div className="flex justify-between items-start mb-4">
              <div className="min-w-0">
                <h3 className="font-bold text-lg text-white group-hover:text-red-500 transition-colors truncate">{project.name}</h3>
                <div className="text-neutral-400 text-sm flex items-center gap-1 mt-1 truncate">
                   <MapPin size={12} className="shrink-0" /> {project.client || 'Geen locatie'}
                </div>
              </div>
              <Badge status={project.status} />
            </div>
            
            <div className="space-y-3 py-4 border-t border-white/5 border-b mb-4">
               <div className="flex items-center gap-3 text-sm text-neutral-300">
                  <CalendarIcon size={16} className="text-neutral-500 shrink-0" />
                  {formatDate(project.startDate)} - {formatDate(project.endDate)}
               </div>
               <div className="flex items-center gap-3 text-sm text-neutral-300">
                  <Clock size={16} className="text-neutral-500 shrink-0" />
                  {formatTime(project.startDate)} - {formatTime(project.endDate)}
               </div>
               <div className="flex items-center gap-3 text-sm text-neutral-300">
                  <Package size={16} className="text-neutral-500 shrink-0" />
                  {project.gearIds?.length || 0} items geprept
               </div>
             </div>
             <div className="grid grid-cols-2 gap-2 mt-4">
              <Button 
                variant="secondary" 
                className="text-xs h-9"
                onClick={() => onView(project)}
              >
                <Eye size={14} /> Pakbon
              </Button>
              <Button 
                variant="secondary" 
                className="text-xs h-9"
                onClick={() => onEditGear(project)}
              >
                <RefreshCw size={14} /> Bewerken
              </Button>
              <Button 
                variant="secondary" 
                className="text-xs h-9 bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500 hover:text-white"
                onClick={() => onDuplicate(project)}
              >
                <RefreshCw size={14} /> Dupliceer
              </Button>
              <Button 
                variant="danger" 
                className="h-9 px-3" 
                onClick={(e) => { 
                  e.stopPropagation();
                  onDelete(project.id);
                }}
              >
                <Trash2 size={14} /> Verwijder
              </Button>
            </div>
         </Card>
       ))}
    </div>
  );
};

// --- SHOOTS PLANNING VIEW ---
const ShootsView = ({ shoots, projects, onStartPrep, onDeleteShoot, onViewProject, onEditProject, onSyncCalendar, onAddShoot, isSyncing }: { 
  shoots: CalendarEvent[], 
  projects: Project[],
  onStartPrep: (details: any) => void,
  onDeleteShoot: (id: string) => void,
  onViewProject: (id: string) => void,
  onEditProject: (id: string) => void,
  onSyncCalendar: () => void,
  onAddShoot: () => void,
  isSyncing: boolean
}) => {
  const [viewMode, setViewMode] = useState<'GRID' | 'CALENDAR'>('CALENDAR');
  const [calendarMode, setCalendarMode] = useState<'DAY' | 'WEEK' | 'MONTH'>('MONTH');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Merge shoots and projects into a common agenda format
  const agendaItems = useMemo(() => {
    const fromShoots = shoots.map(s => ({
      id: s.id,
      summary: s.summary,
      location: s.location || '',
      start: new Date(s.start?.dateTime || s.start?.date || ''),
      end: new Date(s.end?.dateTime || s.end?.date || ''),
      type: 'SHOOT' as const,
      isPrepped: false
    }));

    const fromProjects = projects.map(p => {
      const startDate = new Date(p.startDate);
      const endDate = new Date(p.endDate);
      return {
        id: p.id,
        summary: p.name,
        location: p.client,
        start: isNaN(startDate.getTime()) ? new Date() : startDate,
        end: isNaN(endDate.getTime()) ? new Date() : endDate,
        type: 'PROJECT' as const,
        isPrepped: true
      };
    });

    return [...fromShoots, ...fromProjects]
      .filter(item => !isNaN(item.start.getTime()) && !isNaN(item.end.getTime()))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [shoots, projects]);

  // Calendar Helpers
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const days = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
  
  const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;

  const itemsOnDay = (day: number, month: number, year: number) => {
    const startOfDay = new Date(year, month, day, 0, 0, 0).getTime();
    const endOfDay = new Date(year, month, day, 23, 59, 59).getTime();

    return agendaItems.filter(item => {
      const itemStart = item.start.getTime();
      const itemEnd = item.end.getTime();
      return itemStart <= endOfDay && itemEnd >= startOfDay;
    });
  };

  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    return new Date(d.setDate(diff));
  };

  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const HOUR_HEIGHT = 60; // pixels per hour

  const getEventStyle = (event: any, currentDay: Date) => {
    const startOfDay = new Date(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate(), 0, 0, 0);
    const endOfDay = new Date(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate(), 23, 59, 59, 999);
    
    // Use Math.max/min with getTime() to ensure proper comparison
    const sTime = Math.max(event.start.getTime(), startOfDay.getTime());
    const eTime = Math.min(event.end.getTime(), endOfDay.getTime());
    
    const start = new Date(sTime);
    const end = new Date(eTime);
    
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    const duration = Math.max(30, endMinutes - startMinutes);

    return {
      top: `${(startMinutes / 60) * HOUR_HEIGHT}px`,
      height: `${(duration / 60) * HOUR_HEIGHT}px`,
    };
  };

  const calculateOverlaps = (dayItems: any[], currentDay: Date) => {
    const startOfDay = new Date(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate(), 0, 0, 0, 0).getTime();
    const endOfDay = new Date(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate(), 23, 59, 59, 999).getTime();

    const clippedItems = dayItems.map(item => ({
      ...item,
      clippedStart: new Date(Math.max(item.start.getTime(), startOfDay)),
      clippedEnd: new Date(Math.min(item.end.getTime(), endOfDay))
    })).sort((a, b) => a.clippedStart.getTime() - b.clippedStart.getTime());

    const eventGroups: any[][] = [];

    clippedItems.forEach(event => {
      let placed = false;
      for (const group of eventGroups) {
        const groupEnd = Math.max(...group.map(e => e.clippedEnd.getTime()));
        const groupStart = Math.min(...group.map(e => e.clippedStart.getTime()));
        
        if (event.clippedStart.getTime() < groupEnd && event.clippedEnd.getTime() > groupStart) {
          group.push(event);
          placed = true;
          break;
        }
      }
      if (!placed) eventGroups.push([event]);
    });

    const positionedEvents: any[] = [];
    eventGroups.forEach(group => {
      const columns: any[][] = [];
      group.forEach(event => {
        let colIndex = columns.findIndex(col => {
          const lastEventInCol = col[col.length - 1];
          return event.clippedStart.getTime() >= lastEventInCol.clippedEnd.getTime();
        });

        if (colIndex === -1) {
          columns.push([event]);
          colIndex = columns.length - 1;
        } else {
          columns[colIndex].push(event);
        }
        
        positionedEvents.push({
          ...event,
          colIndex,
          totalCols: 0
        });
      });

      positionedEvents.forEach(pe => {
        if (group.find(ge => ge.id === pe.id)) {
          pe.totalCols = columns.length;
        }
      });
    });

    return positionedEvents;
  };

  const nextPeriod = () => {
    if (calendarMode === 'MONTH') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (calendarMode === 'WEEK') {
      const nextWeek = new Date(currentDate);
      nextWeek.setDate(currentDate.getDate() + 7);
      setCurrentDate(nextWeek);
    } else {
      const nextDay = new Date(currentDate);
      nextDay.setDate(currentDate.getDate() + 1);
      setCurrentDate(nextDay);
    }
  };

  const prevPeriod = () => {
    if (calendarMode === 'MONTH') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (calendarMode === 'WEEK') {
      const prevWeek = new Date(currentDate);
      prevWeek.setDate(currentDate.getDate() - 7);
      setCurrentDate(prevWeek);
    } else {
      const prevDay = new Date(currentDate);
      prevDay.setDate(currentDate.getDate() - 1);
      setCurrentDate(prevDay);
    }
  };

  const CalendarEventItem = ({ item }: { item: any }) => (
    <button
      onClick={() => {
        if (item.isPrepped) {
          onViewProject(item.id);
        } else {
          const d = item.start;
          const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const de = item.end;
          const localEndDate = `${de.getFullYear()}-${String(de.getMonth() + 1).padStart(2, '0')}-${String(de.getDate()).padStart(2, '0')}`;

          onStartPrep({
            name: item.summary,
            client: item.location,
            startDate: localDate,
            startTime: item.start.toLocaleTimeString('nl-NL', {hour: '2-digit', minute:'2-digit'}),
            endDate: localEndDate,
            endTime: item.end.toLocaleTimeString('nl-NL', {hour: '2-digit', minute:'2-digit'}),
          });
        }
      }}
      className={`w-full text-left p-2 rounded-lg transition-all group/event border ${
        item.isPrepped 
        ? 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500 hover:text-white' 
        : 'bg-[#e61e1e]/10 border-[#e61e1e]/20 text-red-400 hover:bg-[#e61e1e] hover:text-white'
      }`}
    >
      <div className="text-[10px] font-bold leading-tight line-clamp-1 flex items-center gap-1">
        {item.isPrepped && <CheckCircle2 size={10} />}
        {item.summary}
      </div>
      <div className="text-[9px] opacity-70 group-hover/event:opacity-100 font-mono mt-0.5">
        {item.start.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} - {item.end.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </button>
  );

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="w-full md:w-auto">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight uppercase italic flex items-center gap-3">
             <div className="w-2 h-8 bg-[#e61e1e] transform -skew-x-12 hidden md:block" />
             Agenda & Planning
          </h2>
          <p className="text-neutral-400 mt-1 text-sm md:text-base">Gecombineerd overzicht van shoots en actieve projecten</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          <Button 
            onClick={onAddShoot}
            className="w-full sm:w-auto bg-[#e61e1e] text-white border-none hover:bg-red-600 gap-2 h-11 px-6 rounded-xl shadow-[0_10px_20px_-5px_rgba(230,30,30,0.3)] transition-all transform hover:-translate-y-0.5"
          >
            <Plus size={18} />
            Shoot Toevoegen
          </Button>

          <Button 
            onClick={onSyncCalendar} 
            disabled={isSyncing}
            className="w-full sm:w-auto bg-neutral-900 text-white border border-white/5 hover:bg-neutral-800 gap-2 h-11 px-6 rounded-xl"
          >
            {isSyncing ? <RefreshCw size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            Sync Google Calendar
          </Button>

          <div className="flex bg-neutral-900 rounded-xl p-1 border border-white/5 w-full sm:w-auto overflow-x-auto scrollbar-hide">
            {['DAY', 'WEEK', 'MONTH'].map((mode) => (
              <button 
                key={mode}
                onClick={() => {
                  setViewMode('CALENDAR');
                  setCalendarMode(mode as any);
                }}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${viewMode === 'CALENDAR' && calendarMode === mode ? 'bg-white text-black border border-black shadow-lg' : 'text-neutral-500 hover:text-white'}`}
              >
                {mode === 'DAY' ? 'Dag' : mode === 'WEEK' ? 'Week' : 'Maand'}
              </button>
            ))}
          </div>

          <div className="flex bg-neutral-900 rounded-lg p-1 border border-white/5">
            <button 
              onClick={() => setViewMode('CALENDAR')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'CALENDAR' ? 'bg-white text-black border border-black shadow-lg' : 'text-neutral-400 hover:text-white'}`}
            >
              Kalender
            </button>
            <button 
              onClick={() => setViewMode('GRID')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'GRID' ? 'bg-white text-black border border-black shadow-lg' : 'text-neutral-400 hover:text-white'}`}
            >
              Lijst
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'GRID' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agendaItems.map(item => (
            <Card 
              key={item.id} 
              onClick={() => item.isPrepped && onViewProject(item.id)}
              className={`group hover:border-[#e61e1e]/30 transition-all flex flex-col relative overflow-hidden ${item.isPrepped ? 'border-green-500/20 bg-green-500/5 cursor-pointer' : ''}`}
            >
              <div className={`absolute top-0 left-0 w-1 h-full bg-[#e61e1e] transform -skew-x-12 -translate-x-full group-hover:translate-x-0 transition-transform duration-500 ${item.isPrepped ? 'bg-green-500' : ''}`}></div>
              
              <div className="flex-1">
                <div className="flex justify-between items-start mb-6">
                  <div className={`p-3 rounded-xl border border-white/5 ${item.isPrepped ? 'bg-green-500/20 text-green-400' : 'bg-neutral-800 text-neutral-400 group-hover:text-white'}`}>
                    {item.isPrepped ? <CheckCircle2 size={24} /> : <CalendarIcon size={24} />}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={item.isPrepped ? 'ACTIVE' : 'PREP'} />
                    {item.type === 'SHOOT' && (
                      <Button 
                        variant="danger" 
                        className="h-8 w-8 p-0 min-h-0 rounded-lg" 
                        onClick={(e) => { e.stopPropagation(); onDeleteShoot(item.id); }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
                
                <h3 className="font-bold text-xl text-white mb-2 leading-tight group-hover:text-[#e61e1e] transition-colors">{item.summary}</h3>
                
                <div className="space-y-3 mt-6">
                  <div className="flex items-center gap-3 text-neutral-400 text-sm">
                    <MapPin size={16} className="shrink-0" />
                    <span className="truncate">{item.location || 'Locatie onbekend'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-neutral-400 text-sm">
                    <CalendarIcon size={16} className="shrink-0" />
                    {item.start.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                  <div className="flex items-center gap-3 text-neutral-300 text-sm font-mono bg-white/5 px-2 py-1 rounded inline-flex">
                    <Clock size={16} className="shrink-0 text-neutral-500" />
                    {item.start.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} - {item.end.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-white/5">
                {item.isPrepped ? (
                  <div className="flex gap-2">
                    <Button 
                      variant="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewProject(item.id);
                      }}
                      className="flex-1 bg-neutral-800 text-white hover:bg-neutral-700"
                    >
                      <Eye size={18} /> Details
                    </Button>
                    <Button 
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditProject(item.id);
                      }}
                      className="flex-1 border-white/10"
                    >
                      <RefreshCw size={18} /> Bewerken
                    </Button>
                  </div>
                ) : (
                  <Button 
                    variant="primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      const d = item.start;
                      const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                      const de = item.end;
                      const localEndDate = `${de.getFullYear()}-${String(de.getMonth() + 1).padStart(2, '0')}-${String(de.getDate()).padStart(2, '0')}`;
                      
                      onStartPrep({
                        name: item.summary,
                        client: item.location,
                        startDate: localDate,
                        startTime: item.start.toLocaleTimeString('nl-NL', {hour: '2-digit', minute:'2-digit'}),
                        endDate: localEndDate,
                        endTime: item.end.toLocaleTimeString('nl-NL', {hour: '2-digit', minute:'2-digit'}),
                      });
                    }}
                    className="w-full"
                  >
                    <Plus size={18} /> Start Gear Prep
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="bg-neutral-900/40 border border-white/5 rounded-3xl p-8 animate-fade-in shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-2xl font-bold uppercase tracking-tight">
              {calendarMode === 'MONTH' && currentDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
              {calendarMode === 'WEEK' && `Week ${Math.ceil(currentDate.getDate() / 7)}, ${currentDate.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })}`}
              {calendarMode === 'DAY' && currentDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <div className="flex gap-2">
              <Button onClick={prevPeriod} className="p-2 border-white/10 hover:bg-white hover:text-black hover:border-black">
                <ArrowLeft size={18} />
              </Button>
              <Button onClick={() => setCurrentDate(new Date())} className="px-4 border-white/10 hover:bg-white hover:text-black hover:border-black text-xs font-mono">
                VANDAAG
              </Button>
              <Button onClick={nextPeriod} className="p-2 border-white/10 hover:bg-white hover:text-black hover:border-black">
                <ArrowRight size={18} />
              </Button>
            </div>
          </div>

          {calendarMode === 'MONTH' && (
            <div className="grid grid-cols-7 md:grid-cols-7 gap-px bg-white/5 border border-white/5 rounded-2xl overflow-hidden">
              {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(day => (
                <div key={day} className="bg-black py-2 md:py-4 text-center text-[8px] md:text-[10px] uppercase font-bold tracking-widest text-neutral-600">
                  {day}
                </div>
              ))}
              
              {Array.from({ length: adjustedFirstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-neutral-950/50 h-20 md:h-40 border-t border-white/5"></div>
              ))}
              
              {Array.from({ length: days }).map((_, i) => {
                const day = i + 1;
                const dayItems = itemsOnDay(day, currentDate.getMonth(), currentDate.getFullYear());
                const isToday = new Date().getDate() === day && 
                              new Date().getMonth() === currentDate.getMonth() && 
                              new Date().getFullYear() === currentDate.getFullYear();

                return (
                  <div key={day} className={`bg-black h-20 md:h-40 p-1 md:p-3 border-t border-white/5 group hover:bg-neutral-900/50 transition-colors ${isToday ? 'relative' : ''}`}>
                    {isToday && (
                      <div className="absolute top-1 right-1 md:top-2 md:right-2 w-1 h-1 md:w-1.5 md:h-1.5 bg-[#e61e1e] rounded-full shadow-[0_0_10px_#e61e1e]"></div>
                    )}
                    <span className={`text-[10px] md:text-xs font-mono ${isToday ? 'text-white font-bold' : 'text-neutral-600 group-hover:text-neutral-400'}`}>
                      {day < 10 ? `0${day}` : day}
                    </span>
                    
                    <div className="mt-1 md:mt-2 space-y-0.5 md:space-y-1 overflow-y-auto max-h-[80%] custom-scrollbar">
                      {dayItems.map(item => (
                        <div key={item.id} className={`md:block ${calendarMode === 'MONTH' ? 'hidden md:block' : ''}`}>
                          <CalendarEventItem item={item} />
                        </div>
                      ))}
                      {/* Mobile dot indicator */}
                      {dayItems.length > 0 && (
                        <div className="md:hidden flex justify-center mt-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${dayItems.some(i => i.isPrepped) ? 'bg-green-500' : 'bg-[#e61e1e]'}`} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {calendarMode === 'MONTH' && (
            <div className="md:hidden mt-4 space-y-2">
              <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-2 mb-2">Events deze maand</div>
              {agendaItems
                .filter(item => item.start.getMonth() === currentDate.getMonth() && item.start.getFullYear() === currentDate.getFullYear())
                .sort((a, b) => a.start.getTime() - b.start.getTime())
                .map(item => (
                  <div key={item.id} className="bg-neutral-900/50 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-1 h-8 rounded-full ${item.isPrepped ? 'bg-green-500' : 'bg-[#e61e1e]'}`} />
                      <div>
                        <div className="text-xs font-bold text-white">{item.summary}</div>
                        <div className="text-[10px] text-neutral-500">{item.start.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} • {item.start.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                    <Button variant="ghost" onClick={() => item.isPrepped ? onViewProject(item.id) : onStartPrep({ name: item.summary, client: item.location, startDate: item.start.toISOString().split('T')[0] })} className="text-[10px] px-3 py-1.5 h-auto">
                      Details
                    </Button>
                  </div>
                ))}
            </div>
          )}

          {calendarMode === 'WEEK' && (
            <div className="flex flex-col bg-white/5 border border-white/5 rounded-2xl overflow-hidden h-[600px] md:h-[700px]">
              {/* Header Row */}
              <div className="flex border-b border-white/10 bg-black z-30 flex-shrink-0">
                <div className="w-12 md:w-16 flex-shrink-0" /> {/* Gutter spacer */}
                <div className="flex-1 grid grid-cols-7 divide-x divide-white/5">
                  {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map((day, i) => {
                    const startOfWeek = getStartOfWeek(currentDate);
                    const dayDate = new Date(startOfWeek);
                    dayDate.setDate(startOfWeek.getDate() + i);
                    const isToday = new Date().toDateString() === dayDate.toDateString();
                    return (
                      <div key={day} className={`py-4 text-center ${isToday ? 'bg-neutral-900' : ''}`}>
                        <div className="text-[10px] uppercase font-bold tracking-widest text-neutral-600 mb-1">{day}</div>
                        <div className={`text-sm md:text-lg font-mono ${isToday ? 'text-[#e61e1e] font-bold' : 'text-white'}`}>
                          {dayDate.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Scrollable Grid */}
              <div className="flex-1 overflow-y-auto relative custom-scrollbar bg-black/20">
                <div className="flex relative">
                  {/* Time gutter */}
                  <div className="w-12 md:w-16 flex-shrink-0 bg-neutral-950/20 border-r border-white/5">
                    {HOURS.map(hour => (
                      <div key={hour} className="h-[60px] relative">
                        <span className="absolute -top-2 left-0 right-0 text-center text-[9px] md:text-[10px] text-neutral-600 font-mono">
                          {String(hour).padStart(2, '0')}:00
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Day columns */}
                  <div className="flex-1 grid grid-cols-7 divide-x divide-white/5 min-h-[1440px]">
                    {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map((day, i) => {
                      const startOfWeek = getStartOfWeek(currentDate);
                      const dayDate = new Date(startOfWeek);
                      dayDate.setDate(startOfWeek.getDate() + i);
                      const dayItems = itemsOnDay(dayDate.getDate(), dayDate.getMonth(), dayDate.getFullYear());
                      const positionedItems = calculateOverlaps(dayItems, dayDate);
                      const isToday = new Date().toDateString() === dayDate.toDateString();

                      return (
                        <div key={day} className="relative">
                          {/* Hour background lines */}
                          {HOURS.map(hour => (
                            <div key={hour} className="absolute left-0 right-0 h-px bg-white/5" style={{ top: `${hour * HOUR_HEIGHT}px` }} />
                          ))}

                          {/* Events */}
                          {positionedItems.map(item => {
                            const style = getEventStyle(item, dayDate);
                            const width = 100 / item.totalCols;
                            const left = item.colIndex * width;

                            return (
                              <div 
                                key={item.id} 
                                className="absolute px-0.5"
                                style={{ 
                                  ...style, 
                                  left: `${left}%`, 
                                  width: `${width}%`,
                                  zIndex: 10 + item.colIndex 
                                }}
                              >
                                <button
                                  onClick={() => {
                                    if (item.isPrepped) onViewProject(item.id);
                                    else {
                                      const d = item.start;
                                      const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                      const de = item.end;
                                      const localEndDate = `${de.getFullYear()}-${String(de.getMonth() + 1).padStart(2, '0')}-${String(de.getDate()).padStart(2, '0')}`;
                                      onStartPrep({
                                        name: item.summary,
                                        client: item.location,
                                        startDate: localDate,
                                        startTime: item.start.toLocaleTimeString('nl-NL', {hour: '2-digit', minute:'2-digit'}),
                                        endDate: localEndDate,
                                        endTime: item.end.toLocaleTimeString('nl-NL', {hour: '2-digit', minute:'2-digit'}),
                                      });
                                    }
                                  }}
                                  className={`w-full h-full text-left p-1 rounded border shadow-sm transition-all group/event overflow-hidden ${
                                    item.isPrepped 
                                    ? 'bg-green-500/80 border-green-400 text-white hover:bg-green-600' 
                                    : 'bg-[#e61e1e]/80 border-[#e61e1e] text-white hover:bg-[#e61e1e]'
                                  }`}
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="text-[8px] md:text-[10px] font-bold leading-tight line-clamp-1 italic">
                                      {item.summary}
                                    </div>
                                  </div>
                                  <div className="text-[7px] md:text-[8px] opacity-80 mt-0.5 font-mono">
                                    {item.start.getHours()}:{String(item.start.getMinutes()).padStart(2, '0')}
                                  </div>
                                </button>
                              </div>
                            );
                          })}

                          {/* Current time indicator line if today */}
                          {isToday && (
                             <div 
                               className="absolute left-0 right-0 h-0.5 bg-red-600 z-30 flex items-center pointer-events-none"
                               style={{ top: `${(new Date().getHours() * 60 + new Date().getMinutes()) / 60 * HOUR_HEIGHT}px` }}
                             >
                               <div className="w-2 h-2 bg-red-600 rounded-full -ml-1" />
                             </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}


          {calendarMode === 'DAY' && (
            <div className="flex flex-col bg-white/5 border border-white/5 rounded-2xl overflow-hidden h-[600px] md:h-[700px]">
              {/* Header Row */}
              <div className="bg-neutral-900 border-b border-white/10 p-4 z-30 flex justify-between items-center flex-shrink-0">
                <div>
                  <div className="text-xs font-bold text-[#e61e1e] uppercase tracking-tighter">Geselecteerde Dag</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {currentDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                </div>
                <div className="text-neutral-500 font-mono text-xs">
                  {itemsOnDay(currentDate.getDate(), currentDate.getMonth(), currentDate.getFullYear()).length} EVENTS
                </div>
              </div>

              {/* Scrollable Layout */}
              <div className="flex-1 overflow-y-auto relative custom-scrollbar bg-black/20">
                <div className="flex relative">
                  {/* Time gutter */}
                  <div className="w-16 flex-shrink-0 bg-neutral-950/20 border-r border-white/5">
                    {HOURS.map(hour => (
                      <div key={hour} className="h-[60px] relative">
                        <span className="absolute -top-2 left-0 right-0 text-center text-xs text-neutral-600 font-mono">
                          {String(hour).padStart(2, '0')}:00
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Day Body */}
                  <div className="flex-1 relative min-h-[1440px]">
                    {/* Hour lines */}
                    {HOURS.map(hour => (
                      <div key={hour} className="absolute left-0 right-0 h-px bg-white/5" style={{ top: `${hour * HOUR_HEIGHT}px` }} />
                    ))}

                    {/* Events */}
                    {calculateOverlaps(itemsOnDay(currentDate.getDate(), currentDate.getMonth(), currentDate.getFullYear()), currentDate).map(item => {
                      const style = getEventStyle(item, currentDate);
                      const width = 100 / item.totalCols;
                      const left = item.colIndex * width;

                      return (
                        <div 
                          key={item.id} 
                          className="absolute px-1"
                          style={{ 
                            ...style, 
                            left: `${left}%`, 
                            width: `${width}%`,
                            zIndex: 10 + item.colIndex 
                          }}
                        >
                          <button
                            onClick={() => {
                              if (item.isPrepped) onViewProject(item.id);
                              else {
                                const d = item.start;
                                const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                const de = item.end;
                                const localEndDate = `${de.getFullYear()}-${String(de.getMonth() + 1).padStart(2, '0')}-${String(de.getDate()).padStart(2, '0')}`;
                                onStartPrep({
                                  name: item.summary,
                                  client: item.location,
                                  startDate: localDate,
                                  startTime: item.start.toLocaleTimeString('nl-NL', {hour: '2-digit', minute:'2-digit'}),
                                  endDate: localEndDate,
                                  endTime: item.end.toLocaleTimeString('nl-NL', {hour: '2-digit', minute:'2-digit'}),
                                });
                              }
                            }}
                            className={`w-full h-full text-left p-3 rounded-xl border-2 shadow-xl transition-all group/event overflow-hidden flex flex-col ${
                              item.isPrepped 
                              ? 'bg-green-500/90 border-green-400 text-white hover:bg-green-600' 
                              : 'bg-[#e61e1e]/90 border-[#e61e1e] text-white hover:bg-[#e61e1e]'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <span className="text-xs font-bold uppercase tracking-tight italic opacity-80">{item.isPrepped ? 'Project' : 'Shoot'}</span>
                              <span className="text-[10px] font-mono opacity-80">{item.start.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <h4 className="text-sm md:text-lg font-bold mt-1 line-clamp-2">{item.summary}</h4>
                            <div className="mt-auto flex items-center gap-2 opacity-80 text-[10px]">
                              <MapPin size={10} /> {item.location || 'N.v.t.'}
                            </div>
                          </button>
                        </div>
                      );
                    })}

                    {/* Current time indicator line if today */}
                    {new Date().toDateString() === currentDate.toDateString() && (
                       <div 
                         className="absolute left-0 right-0 h-0.5 bg-[#e61e1e] z-30 flex items-center pointer-events-none"
                         style={{ top: `${(new Date().getHours() * 60 + new Date().getMinutes()) / 60 * HOUR_HEIGHT}px` }}
                       >
                         <div className="w-3 h-3 bg-[#e61e1e] rounded-full -ml-1.5 shadow-[0_0_10px_#e61e1e]" />
                       </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};
