import React, { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Users, Globe, Target, Smartphone, RefreshCw, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(210, 70%, 55%)",
  "hsl(340, 65%, 55%)",
  "hsl(160, 55%, 45%)",
  "hsl(45, 80%, 55%)",
  "hsl(280, 55%, 55%)",
  "hsl(20, 70%, 55%)",
];

type OnboardingRow = {
  id: string;
  language: string | null;
  goals: string[] | null;
  source: string | null;
  previous_app: string | null;
  frustration: string | null;
  task_view_preference: string | null;
  journey_selected: string | null;
  devices: string[] | null;
  offline_preference: string | null;
  unfinished_reason: string | null;
  slowdown_reason: string | null;
  why_apps_fail: string | null;
  note_created: boolean | null;
  sketch_created: boolean | null;
  tasks_created_count: number | null;
  notes_folders_count: number | null;
  tasks_folders_count: number | null;
  created_at: string;
};

function countField(rows: OnboardingRow[], field: keyof OnboardingRow): { name: string; value: number }[] {
  const counts: Record<string, number> = {};
  rows.forEach(r => {
    const val = r[field];
    if (val && typeof val === "string") {
      counts[val] = (counts[val] || 0) + 1;
    }
  });
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function countArrayField(rows: OnboardingRow[], field: "goals" | "devices"): { name: string; value: number }[] {
  const counts: Record<string, number> = {};
  rows.forEach(r => {
    const arr = r[field];
    if (Array.isArray(arr)) {
      arr.forEach((item: string) => {
        if (item) counts[item] = (counts[item] || 0) + 1;
      });
    }
  });
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

const ChartCard = ({ title, icon: Icon, data, type = "bar" }: {
  title: string;
  icon: React.ElementType;
  data: { name: string; value: number }[];
  type?: "bar" | "pie";
}) => {
  if (!data.length) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {type === "pie" ? (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, data.length * 48)}>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} fontSize={11} />
              <YAxis type="category" dataKey="name" width={160} fontSize={10} tick={{ fill: "hsl(var(--foreground))" }} interval={0} />
              <Tooltip />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default function AdminOnboarding() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OnboardingRow[]>([]);
  const [loading, setLoading] = useState(false);
  // SECURITY: keep the admin password only in component state (memory).
  // Never persist it to localStorage/sessionStorage — that would expose it
  // to XSS or malicious browser extensions. The trade-off is the admin must
  // re-enter the password on page reload.
  const [adminPassword, setAdminPassword] = useState<string>("");
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const fetchData = async (pw: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-fetch-onboarding", {
        body: { password: pw },
      });
      if (error) throw error;
      setRows(((data as any)?.rows as OnboardingRow[] | null) || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setVerifying(true);
    setError("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-admin", {
        body: { password },
      });
      if (fnError) throw fnError;
      if (data?.valid) {
        setAdminPassword(password);
        setAuthenticated(true);
        setPassword("");
        await fetchData(password);
      } else {
        setError("Incorrect password");
      }
    } catch {
      setError("Verification failed. Try again.");
    } finally {
      setVerifying(false);
    }
  };


  const stats = useMemo(() => {
    let notesCreated = 0, sketchesCreated = 0, totalTasks = 0, totalNotesFolders = 0, totalTasksFolders = 0;
    rows.forEach(r => {
      if (r.note_created) notesCreated++;
      if (r.sketch_created) sketchesCreated++;
      totalTasks += r.tasks_created_count || 0;
      totalNotesFolders += r.notes_folders_count || 0;
      totalTasksFolders += r.tasks_folders_count || 0;
    });
    return {
      languages: countField(rows, "language"),
      goals: countArrayField(rows, "goals"),
      sources: countField(rows, "source"),
      previousApps: countField(rows, "previous_app"),
      frustrations: countField(rows, "frustration"),
      viewPrefs: countField(rows, "task_view_preference"),
      journeys: countField(rows, "journey_selected"),
      devices: countArrayField(rows, "devices"),
      offlinePrefs: countField(rows, "offline_preference"),
      unfinishedReasons: countField(rows, "unfinished_reason"),
      slowdownReasons: countField(rows, "slowdown_reason"),
      whyAppsFail: countField(rows, "why_apps_fail"),
      notesCreated,
      sketchesCreated,
      totalTasks,
      totalNotesFolders,
      totalTasksFolders,
    };
  }, [rows]);

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <Lock className="w-10 h-10 mx-auto text-primary mb-2" />
            <CardTitle className="text-lg">Admin Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={handleLogin} disabled={verifying}>
              {verifying ? "Verifying..." : "Unlock"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-8">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold flex-1">Onboarding Analytics</h1>
        <Button variant="ghost" size="icon" onClick={() => fetchData(adminPassword)} disabled={loading || !adminPassword}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Users className="w-6 h-6 mx-auto text-primary mb-1" />
              <div className="text-2xl font-bold">{rows.length}</div>
              <div className="text-xs text-muted-foreground">Total Responses</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Globe className="w-6 h-6 mx-auto text-primary mb-1" />
              <div className="text-2xl font-bold">{stats.languages.length}</div>
              <div className="text-xs text-muted-foreground">Languages</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Target className="w-6 h-6 mx-auto text-primary mb-1" />
              <div className="text-2xl font-bold">{stats.notesCreated}</div>
              <div className="text-xs text-muted-foreground">Notes Created</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Smartphone className="w-6 h-6 mx-auto text-primary mb-1" />
              <div className="text-2xl font-bold">{stats.sketchesCreated}</div>
              <div className="text-xs text-muted-foreground">Sketches Created</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Target className="w-6 h-6 mx-auto text-primary mb-1" />
              <div className="text-2xl font-bold">{stats.totalTasks}</div>
              <div className="text-xs text-muted-foreground">Tasks Created</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Globe className="w-6 h-6 mx-auto text-primary mb-1" />
              <div className="text-2xl font-bold">{stats.totalNotesFolders + stats.totalTasksFolders}</div>
              <div className="text-xs text-muted-foreground">Folders Created</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <ChartCard title="Languages" icon={Globe} data={stats.languages} type="pie" />
        <ChartCard title="Goals Selected" icon={Target} data={stats.goals} />
        <ChartCard title="How Users Found Us" icon={Users} data={stats.sources} />
        <ChartCard title="Previous Apps Used" icon={Smartphone} data={stats.previousApps} />
        <ChartCard title="Frustrations" icon={Target} data={stats.frustrations} />
        <ChartCard title="Task View Preference" icon={Target} data={stats.viewPrefs} type="pie" />
        <ChartCard title="Journey Selected" icon={Target} data={stats.journeys} type="pie" />
        <ChartCard title="Devices" icon={Smartphone} data={stats.devices} />
        <ChartCard title="Offline Preference" icon={Target} data={stats.offlinePrefs} type="pie" />
        <ChartCard title="Why Tasks Stay Unfinished" icon={Target} data={stats.unfinishedReasons} />
        <ChartCard title="What Slows Users Down" icon={Target} data={stats.slowdownReasons} />
        <ChartCard title="Why Apps Fail" icon={Target} data={stats.whyAppsFail} />
      </div>
    </div>
  );
}
