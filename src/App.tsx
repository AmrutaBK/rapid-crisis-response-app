import React, { useState, useEffect } from "react";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  updateDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db, signInWithGoogle, isConfigValid } from "./lib/firebase";
import { 
  AlertTriangle, 
  Flame, 
  Stethoscope, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  Activity,
  LogOut,
  Send,
  Database
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Local types for AI fallback
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const getApiKey = () => {
  try {
    return (process?.env?.GEMINI_API_KEY) || "";
  } catch (e) {
    return "";
  }
};

const ai = new GoogleGenerativeAI({ apiKey: getApiKey() });

// Types
interface EmergencyReport {
  id: string;
  description: string;
  emergencyType: "Fire" | "Medical" | "Security" | "Other";
  priority: "Low" | "Medium" | "High";
  confidence: number;
  status: "Pending" | "In Progress" | "Resolved";
  createdAt: any;
  updatedAt: any;
  reporterId: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [reports, setReports] = useState<EmergencyReport[]>([]);
  const [description, setDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigValid) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      // In a real app, you'd check a dedicated 'admins' collection
      // For this demo, we can assume the first user or check email domain
      if (u) {
        setIsAdmin(true); // Simplified for demo purposes
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isConfigValid) return;

    const q = query(
      collection(db, "reports"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as EmergencyReport[];
      setReports(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "reports");
    });

    return () => unsubscribe();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !user || !isConfigValid) return;

    setIsAnalyzing(true);
    setLastError(null);
    try {
      const model = ai.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: "You are an emergency response AI. Classify the user's emergency description into emergencyType (Fire, Medical, Security, Other), priority (Low, Medium, High), and provide a confidence score (0-100).",
      });

      const response = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: `Analyze the following emergency report and classify it.
              Report: "${description}"
              
              Return the classification in exact JSON format.` }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              emergencyType: {
                type: SchemaType.STRING,
                description: "The type of emergency.",
                enum: ["Fire", "Medical", "Security", "Other"]
              },
              priority: {
                type: SchemaType.STRING,
                description: "The priority level.",
                enum: ["Low", "Medium", "High"]
              },
              confidence: {
                type: SchemaType.NUMBER,
                description: "Confidence score from 0 to 100."
              }
            },
            required: ["emergencyType", "priority", "confidence"]
          }
        }
      });

      const analysis = JSON.parse(response.response.text());

      setIsSubmitting(true);
      await addDoc(collection(db, "reports"), {
        description,
        emergencyType: analysis.emergencyType,
        priority: analysis.priority,
        confidence: analysis.confidence,
        status: "Pending",
        reporterId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setDescription("");
    } catch (error) {
      console.error("AI Analysis failed:", error);
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAnalyzing(false);
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (reportId: string, newStatus: "In Progress" | "Resolved") => {
    if (!isConfigValid) return;
    try {
      const reportRef = doc(db, "reports", reportId);
      await updateDoc(reportRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "High": return "text-red-500 bg-red-50 border-red-200";
      case "Medium": return "text-amber-500 bg-amber-50 border-amber-200";
      default: return "text-blue-500 bg-blue-50 border-blue-200";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "Fire": return <Flame className="w-5 h-5 text-red-600" />;
      case "Medical": return <Stethoscope className="w-5 h-5 text-emerald-600" />;
      case "Security": return <ShieldAlert className="w-5 h-5 text-indigo-600" />;
      default: return <AlertTriangle className="w-5 h-5 text-gray-600" />;
    }
  };

  if (!isConfigValid) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 font-sans text-white">
        <div className="max-w-md w-full bg-[#0D0D0D] p-10 border border-red-900/50 space-y-6 text-center">
          <Database className="w-16 h-16 text-red-600 mx-auto" />
          <h1 className="text-2xl font-black uppercase italic tracking-tighter">Database Setup Required</h1>
          <p className="text-slate-500 text-sm font-mono uppercase tracking-widest leading-relaxed">
            Firebase configuration is missing or invalid. Please rerun the setup tool and accept the terms.
          </p>
          <div className="p-4 bg-red-950/20 border border-red-900/30 text-[10px] text-red-400 font-mono text-left">
            ERROR_LOG: auth/api-key-not-valid<br/>
            STATUS: WAITING_FOR_PROVISIONING
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-[#0D0D0D] p-10 text-center space-y-8 border border-[#2A2A2A] relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-[#FF3E3E]" />
          
          <div className="w-20 h-20 bg-[#1A1A1A] flex items-center justify-center mx-auto border border-[#333]">
            <Activity className="w-10 h-10 text-[#FF3E3E]" />
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-black tracking-tighter uppercase italic text-white">Crisis:Unit</h1>
            <p className="text-[#555] font-mono text-xs uppercase tracking-widest leading-loose">
              Hospitality Emergency<br/>Management System v1.0
            </p>
          </div>

          <div className="space-y-4">
            <button 
              onClick={signInWithGoogle}
              className="w-full py-4 bg-[#FF3E3E] text-black font-black uppercase text-sm tracking-widest hover:bg-red-600 transition-all active:scale-95"
            >
              Initialize Connection
            </button>
            <p className="text-[10px] text-[#333] font-mono italic uppercase">
              Secure Auth Gateway Active // Google OAuth 2.0
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F0F0F0] font-sans flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="h-20 border-b border-[#2A2A2A] flex items-center justify-between px-8 bg-[#0D0D0D] flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#FF3E3E] rounded-none flex items-center justify-center font-black text-black text-xl">!</div>
          <h1 className="text-2xl font-black tracking-tighter uppercase italic">
            Crisis:Unit <span className="text-[#555] font-normal not-italic lowercase">Hospitality v1.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-8">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#888] font-bold">System Status</span>
            <span className="text-emerald-500 font-mono text-sm leading-none">OPERATIONAL // NO DELAY</span>
          </div>
          <div className="flex items-center gap-4 border-l border-[#2A2A2A] pl-8">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold uppercase tracking-wider">{user.displayName}</p>
              <p className="text-[10px] text-[#555] font-mono">{user.email}</p>
            </div>
            <button 
              onClick={() => auth.signOut()}
              className="w-10 h-10 border border-[#333] flex items-center justify-center text-[#555] hover:text-[#FF3E3E] hover:border-[#FF3E3E] transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Side: Report Form */}
        <section className="w-[320px] border-r border-[#2A2A2A] p-6 flex flex-col gap-6 bg-[#0F0F0F] overflow-y-auto">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#FF3E3E]">Manual Trigger</label>
            <button 
              onClick={() => document.getElementById('emergency-input')?.focus()}
              className="w-full h-16 bg-[#FF3E3E] hover:bg-red-600 transition-colors text-black font-black uppercase text-lg"
            >
              Report Emergency
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 pt-4 flex-1 flex flex-col">
            <div className="space-y-2 flex-1 flex flex-col">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#888]">AI Input Description</label>
              <textarea 
                id="emergency-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the incident..."
                className="w-full flex-1 bg-[#1A1A1A] border border-[#333] p-4 text-sm focus:outline-none focus:border-[#FF3E3E] resize-none text-[#F0F0F0] placeholder-[#444]"
                disabled={isAnalyzing || isSubmitting}
              />
            </div>
            <button 
              disabled={!description.trim() || isAnalyzing || isSubmitting}
              className={`w-full py-4 font-black uppercase text-xs tracking-widest shadow-lg transition-all active:scale-95 border ${
                isAnalyzing || isSubmitting 
                ? "bg-[#1A1A1A] border-[#222] text-[#444] cursor-not-allowed" 
                : "bg-white text-black hover:bg-gray-200"
              }`}
            >
              {isAnalyzing ? "Analyzing Matrix..." : "Analyze with Gemini"}
            </button>

            {lastError && (
              <div className="p-3 bg-red-950/20 border border-red-900/50 text-[10px] text-red-500 font-mono uppercase tracking-tight leading-relaxed">
                ERROR: {lastError}
              </div>
            )}
          </form>

          <div className="mt-auto p-4 border border-dashed border-[#333] rounded">
            <span className="text-[10px] text-[#555] font-mono leading-tight block uppercase">
              [LOG: {new Date().toLocaleTimeString()}] System ready. Waiting for payload...
            </span>
          </div>
        </section>

        {/* Central Feed */}
        <section className="flex-1 p-8 bg-[#0A0A0A] overflow-y-auto">
          <div className="flex justify-between items-end mb-12">
            <h2 className="text-5xl font-black italic tracking-tighter uppercase leading-none">Active Incidents</h2>
            <span className="text-[#555] font-mono text-xs uppercase">Telemetry: {reports.length} Total</span>
          </div>

          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {reports.map((report) => (
                <motion.div
                  key={report.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className={`group relative bg-[#151515] hover:bg-[#1A1A1A] border-l-4 p-5 flex items-center justify-between transition-colors ${
                    report.priority === "High" ? "border-red-500" : 
                    report.priority === "Medium" ? "border-amber-500" : "border-blue-500"
                  }`}
                >
                  <div className="flex gap-8 items-center">
                    <div className="text-[10px] font-mono text-[#444] rotate-90 w-10 flex-shrink-0">
                      {report.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div>
                      <h3 className={`text-xl font-black uppercase italic ${report.status === 'Resolved' ? 'text-[#444]' : 'text-[#F0F0F0]'}`}>
                        {report.emergencyType} Alert
                      </h3>
                      <p className={`text-sm tracking-tight ${report.status === 'Resolved' ? 'text-[#333]' : 'text-[#888]'}`}>
                        {report.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="text-right hidden sm:block">
                      <div className="text-[10px] uppercase text-[#555] tracking-widest font-bold">Severity</div>
                      <div className={`font-black uppercase italic ${
                        report.priority === "High" ? "text-red-500" : 
                        report.priority === "Medium" ? "text-amber-500" : "text-blue-500"
                      }`}>
                        {report.priority === "High" ? "Critical" : report.priority === "Medium" ? "Elevated" : "Standard"}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-4 py-1 text-[10px] font-black uppercase tracking-widest ${
                        report.status === "Resolved" ? "border border-[#222] text-[#444]" :
                        report.status === "In Progress" ? "bg-amber-500 text-black shadow-[4px_4px_0px_0px_#8b5e02]" :
                        "bg-[#222] text-[#888]"
                      }`}>
                        {report.status}
                      </span>
                      
                      {isAdmin && report.status !== "Resolved" && (
                        <div className="flex gap-1">
                          {report.status === "Pending" && (
                            <button 
                              onClick={() => updateStatus(report.id, "In Progress")}
                              className="w-8 h-8 bg-white text-black flex items-center justify-center hover:bg-amber-500 transition-colors shadow-sm"
                              title="Take Action"
                            >
                              <Activity className="w-4 h-4" />
                            </button>
                          )}
                          <button 
                            onClick={() => updateStatus(report.id, "Resolved")}
                            className="w-8 h-8 bg-[#FF3E3E] text-black flex items-center justify-center hover:bg-emerald-500 transition-colors shadow-sm"
                            title="Resolve"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {reports.length === 0 && (
              <div className="py-24 text-center border-2 border-dashed border-[#1A1A1A] rounded-sm">
                <Activity className="w-12 h-12 mx-auto text-[#222] mb-4" />
                <p className="text-[#444] uppercase font-black italic text-lg tracking-widest">Awaiting Crisis Data</p>
              </div>
            )}
          </div>
        </section>

        {/* Right Side: AI Analytics */}
        <section className="w-[300px] bg-[#0D0D0D] border-l border-[#2A2A2A] p-6 overflow-y-auto hidden xl:block shrink-0">
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] mb-8 border-b border-[#2A2A2A] pb-2">
            Intelligence Analysis
          </h4>
          
          <div className="space-y-10">
            {reports.length > 0 ? (
              <>
                <div className="space-y-3">
                  <span className="text-[10px] uppercase text-[#444] font-bold">Latest Classification</span>
                  <div className="text-3xl font-black italic uppercase text-[#FF3E3E] leading-tight">
                    {reports[0].emergencyType} Detected
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] uppercase text-[#444] font-bold">Confidence Score</span>
                    <span className="text-xs font-mono text-[#F0F0F0]">{Math.round(reports[0].confidence)}%</span>
                  </div>
                  <div className="relative h-1 bg-[#1A1A1A] w-full">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${reports[0].confidence}%` }}
                      className="absolute top-0 left-0 h-full bg-[#FF3E3E]"
                    />
                  </div>
                </div>

                <div className="p-4 bg-[#151515] border border-[#222] space-y-4">
                  <span className="text-[10px] uppercase text-[#555] font-bold">AI Payload Hash</span>
                  <pre className="text-[10px] text-emerald-500 font-mono leading-relaxed overflow-x-hidden">
                    {JSON.stringify({
                      type: reports[0].emergencyType,
                      prio: reports[0].priority,
                      conf: (reports[0].confidence / 100).toFixed(2),
                      id: reports[0].id.substring(0, 8)
                    }, null, 2)}
                  </pre>
                </div>

                <div className="pt-6 space-y-4 border-t border-[#2A2A2A]">
                  <div className="text-[10px] uppercase text-[#555] font-bold">Active On-Site Lead</div>
                  <div className="flex items-center gap-3 bg-[#151515] p-3 border border-[#222]">
                    <div className="w-10 h-10 bg-[#222] flex items-center justify-center font-bold text-xs text-[#555]">
                       {user.displayName?.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="text-xs">
                      <div className="font-black uppercase italic">{user.displayName}</div>
                      <div className="text-[#555] font-mono text-[10px]">AUTH_VERIFIED</div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4 opacity-40">
                <div className="h-4 bg-[#1A1A1A] w-3/4 animate-pulse" />
                <div className="h-1 bg-[#1A1A1A] w-full" />
                <div className="h-20 bg-[#1A1A1A] w-full" />
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer Status Bar */}
      <footer className="h-8 bg-[#FF3E3E] flex items-center px-8 text-black text-[10px] font-black uppercase tracking-[0.3em] flex-shrink-0">
        Streaming Live Data: Firestore Connected &bull; AI Gateway: Gemini Pro &bull; Security Level: 5/5
      </footer>
    </div>
  );
}
