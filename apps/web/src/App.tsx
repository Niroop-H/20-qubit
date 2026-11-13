import { LabNav } from "./lab/Shared";
import { newId } from "./services/id";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { CircuitControls } from "./components/Header";
import { QuantumScene } from "./components/QuantumScene";
import { Palette } from "./components/Palette";
import { CircuitGrid } from "./components/CircuitGrid";
import { ExecutionPanel } from "./components/ExecutionPanel";
import { CodeEditor, CodeFormat } from "./components/CodeEditor";
import { Inspector } from "./components/Inspector";
import { OperationEditor } from "./components/OperationEditor";
import { NoiseDialog } from "./components/NoiseDialog";
import type { GateType, NoiseSettings } from "./types";
import {
  Program,
  Step,
  validateProgram,
  circuitStats,
} from "../../engine/src/studio/model";
import { parseQasm, toQasm, toQiskit } from "../../engine/src/studio/qasm";
import { optimize, transpile } from "../../engine/src/studio/transform";
import type { StudioResult } from "../../engine/src/studio/simulate";
import { startLocalJob } from "./services/local";
import { examples, initialProgram } from "./services/examples";
import {
  Project,
  Job,
  readStored,
  saveStored,
  download,
  importProject,
} from "./services/projects";

type Tab =
  "compose" | "code" | "inspect" | "transform" | "projects" | "jobs" | "guide";
const noiseDefault: NoiseSettings = {
  enabled: false,
  t1: 50,
  t2: 70,
  gateTime: 0.02,
  readoutError: [0.015, 0.025],
  depolarizingRate: 0.001,
};
const draftKey = "mah-studio-draft-v2",
  projectsKey = "mah-studio-projects-v2",
  jobsKey = "mah-studio-jobs-v2";
function restoreDraft() {
  const draft = readStored<any>(draftKey, null);
  try {
    validateProgram(draft?.program);
    return draft;
  } catch {
    return {
      program: initialProgram(),
      name: "Bell experiment",
      code: null,
      format: "qasm2",
    };
  }
}
const encode = (p: Program, f: CodeFormat) =>
  f === "qiskit" ? toQiskit(p) : toQasm(p, f === "qasm3" ? 3 : 2);
export const App: React.FC = () => {
  const [initial] = useState(restoreDraft);
  const [history, setHistory] = useState<Program[]>([initial.program]),
    [cursor, setCursor] = useState(0);
  const program = history[cursor];
  const [name, setName] = useState<string>(
    initial.name ?? "Untitled experiment",
  );
  const [tab, setTab] = useState<Tab>("compose"),
    [motion, setMotion] = useState(true),
    [showHero, setShowHero] = useState(false);
  const [selectedGate, setSelectedGate] = useState<GateType | null>("H"),
    [paramAngle, setParamAngle] = useState(Math.PI / 2),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [format, setFormat] = useState<CodeFormat>(
    ["qasm2", "qasm3", "qiskit"].includes(initial.format)
      ? initial.format
      : "qasm2",
  );
  const [source, setSource] = useState<string>(
    typeof initial.code === "string"
      ? initial.code
      : encode(initial.program, format),
  );
  const [shots, setShots] = useState(1024),
    [seed, setSeed] = useState(42),
    [noise, setNoise] = useState<NoiseSettings>(noiseDefault),
    [noiseOpen, setNoiseOpen] = useState(false);
  const [result, setResult] = useState<StudioResult | null>(null),
    [isRunning, setRunning] = useState(false),
    [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [storageWarning, setStorageWarning] = useState(false);
  const [projects, setProjects] = useState<Project[]>(() => {
    const values = readStored<unknown>(projectsKey, []);
    return Array.isArray(values)
      ? values.filter((p) => {
          try {
            validateProgram(p.program);
            return typeof p.id === "string" && typeof p.name === "string";
          } catch {
            return false;
          }
        })
      : [];
  });
  const [jobs, setJobs] = useState<Job[]>(() => {
    const values = readStored<unknown>(jobsKey, []);
    return Array.isArray(values)
      ? values
          .filter((j) => {
            try {
              validateProgram(j.program);
              return (
                typeof j.id === "string" &&
                typeof j.name === "string" &&
                ["completed", "failed", "cancelled"].includes(j.status)
              );
            } catch {
              return false;
            }
          })
          .slice(0, 20)
      : [];
  });
  const [linear, setLinear] = useState(false),
    [transformed, setTransformed] = useState<{
      program: Program;
      before: ReturnType<typeof circuitStats>;
      kind: string;
    } | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stats = useMemo(() => circuitStats(program), [program]);
  const dirty = format !== "qiskit" && source !== encode(program, format);
  useEffect(() => {
    if (!saveStored(draftKey, { program, name, code: source, format }))
      setStorageWarning(true);
  }, [program, name, source, format]);
  useEffect(() => {
    if (!saveStored(projectsKey, projects)) setStorageWarning(true);
  }, [projects]);
  useEffect(() => {
    // Keep browser storage bounded; large results can be exported during the session.
    const persistentJobs = jobs.map((job) =>
      job.result && JSON.stringify(job.result).length > 90000
        ? { ...job, result: undefined }
        : job
    );
    if (!saveStored(jobsKey, persistentJobs)) setStorageWarning(true);
  }, [jobs]);
  useEffect(() => () => cancelRef.current?.(), []);
  const notice = (text: string) => {
    setError("");
    setMessage(text);
  };
  const commit = (p: Program, keepCode = false) => {
    validateProgram(p);
    setHistory((h) => [...h.slice(Math.max(0, cursor - 49), cursor + 1), p]);
    setCursor(Math.min(cursor + 1, 50));
    setResult(null);
    setSelectedId(null);
    setTransformed(null);
    if (!keepCode) setSource(encode(p, format));
  };
  const guard = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      setError((e as Error).message);
      setMessage("");
    }
  };
  const ensureClean = () => {
    if (dirty)
      throw new Error(
        "Apply your code changes or use “Discard code draft” before changing the visual circuit.",
      );
  };
  const visualChange = (p: Program) =>
    guard(() => {
      ensureClean();
      commit(p);
    });
  const undo = (delta: number) => {
    if (isRunning) return;
    guard(() => {
      ensureClean();
      const next = cursor + delta;
      if (next < 0 || next >= history.length) return;
      setCursor(next);
      setSource(encode(history[next], format));
      setResult(null);
      setTransformed(null);
      setSelectedId(null);
    });
  };
  const applyCode = () => {
    const p = parseQasm(source);
    commit(p);
    notice(`Compiled ${p.steps.length} operations for ${p.qubits} qubit(s).`);
    return p;
  };
  const execute = async (
    p: Program,
    jobShots = shots,
    jobSeed = seed,
    jobNoise = noise,
    jobName = name,
  ) => {
    if (isRunning) return;
    setError("");
    setMessage("");
    setResult(null);
    setRunning(true);
    setProgress(0);
    const job: Job = {
      id: newId(),
      name: jobName || "Untitled experiment",
      created: new Date().toISOString(),
      program: p,
      shots: jobShots,
      seed: jobSeed,
      noise: { ...jobNoise },
      status: "completed",
    };
    try {
      const task = startLocalJob(p, jobShots, jobSeed, jobNoise, setProgress);
      cancelRef.current = task.cancel;
      const res = await task.promise;
      setResult(res);
      job.result = res;
      setMessage(
        `Completed locally · ${jobShots.toLocaleString()} shots · seed ${jobSeed}.`,
      );
    } catch (e) {
      job.error = (e as Error).message;
      job.status =
        job.error === "Simulation cancelled." ? "cancelled" : "failed";
      setError(job.error);
    } finally {
      cancelRef.current = null;
      setRunning(false);
      setJobs((j) => [job, ...j].slice(0, 20));
    }
  };
  const run = () =>
    guard(() => {
      if (dirty) {
        if (tab !== "code")
          throw new Error(
            "You have unapplied code. Open Code and compile it, or discard the draft.",
          );
        const p = applyCode();
        void execute(p);
      } else void execute(program);
    });
  const loadExample = (index: number) =>
    guard(() => {
      ensureClean();
      const ex = examples[index];
      commit(parseQasm(ex.source));
      setName(ex.name);
      notice(ex.description);
    });
  const changeFormat = (f: CodeFormat) =>
    guard(() => {
      if (dirty) {
        const p = parseQasm(source);
        commit(p, true);
        setSource(encode(p, f));
      } else setSource(encode(program, f));
      setFormat(f);
    });
  const saveProject = () =>
    guard(() => {
      ensureClean();
      const p: Project = {
        id: newId(),
        name: name.trim() || "Untitled experiment",
        program,
        updated: new Date().toISOString(),
      };
      setProjects((v) => [p, ...v].slice(0, 30));
      notice(
        "Saved a project snapshot on this browser. Export JSON for a portable backup.",
      );
    });
  const exportCode = () =>
    download(
      `${name.replace(/[^a-z0-9_-]/gi, "_") || "quantum"}.${format === "qiskit" ? "py" : "qasm"}`,
      source,
    );
  const importFile = async (file: File) => {
    if (file.size > 100000) {
      setError("Import a file smaller than 100 KB.");
      return;
    }
    try {
      ensureClean();
      const text = await file.text();
      const imported = file.name.toLowerCase().endsWith(".json")
        ? importProject(text)
        : { program: parseQasm(text), name: file.name.replace(/\.[^.]+$/, "") };
      commit(imported.program);
      setName(imported.name);
      notice("Imported and validated the circuit.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const updateStep = (s: Step) =>
    visualChange({
      ...program,
      steps: program.steps.map((x) => (x.id === s.id ? s : x)),
    });
  const moveStep = (delta: number) => {
    const index = program.steps.findIndex((x) => x.id === selectedId),
      next = index + delta;
    if (index < 0 || next < 0 || next >= program.steps.length) return;
    const steps = [...program.steps];
    [steps[index], steps[next]] = [steps[next], steps[index]];
    visualChange({ ...program, steps });
  };
  return (
    <div id="top" className={`studio-app ${motion ? "" : "motion-paused"}`}><LabNav/>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <main className="studio-main lab-main">
        <div className="lab-welcome">
          <div>
            <p className="eyebrow">MAH QUANTUM / DEVELOPMENT STUDIO</p>
            <h1>
              Build. Code. <em>Explore.</em>
            </h1>
            <p>Quantum circuits and code. Entirely in your browser.</p>
          </div>
          <div className="lab-welcome-actions">
            <span className="lab-tag">FREE · NO API KEYS</span>
            <button onClick={() => setShowHero((v) => !v)}>
              {showHero ? "Hide" : "Show"} quantum core
            </button>
          </div>
        </div>
      <CircuitControls
        onRun={run}
        onReset={() => visualChange({ ...program, steps: [] })}
        isRunning={isRunning}
        shots={shots}
        setShots={(s) => {
          setShots(s);
          setResult(null);
        }}
        qubits={program.qubits}
        setQubits={(q) =>
          visualChange({
            qubits: q,
            bits: q,
            steps: program.steps.filter(
              (s) =>
                [...s.targets, ...(s.controls ?? [])].every((i) => i < q) &&
                (s.classical ?? 0) < q,
            ),
          })
        }
        toggleNoiseModal={() => !isRunning && setNoiseOpen(true)}
        noiseEnabled={noise.enabled}
      />
        {showHero && (
          <QuantumScene
            qubits={program.qubits}
            gateCount={program.steps.length}
            isRunning={isRunning}
            motion={motion}
            onToggleMotion={() => setMotion((v) => !v)}
          />
        )}
        <section id="workspace" aria-label="Quantum development workspace">
          <div className="project-toolbar">
            <label>
              EXPERIMENT
              <input
                aria-label="Experiment name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="lab-actions">
              <button
                disabled={isRunning || cursor === 0}
                onClick={() => undo(-1)}
              >
                ↶ Undo
              </button>
              <button
                disabled={isRunning || cursor === history.length - 1}
                onClick={() => undo(1)}
              >
                ↷ Redo
              </button>
              <button disabled={isRunning} onClick={saveProject}>
                Save snapshot
              </button>
              <button
                disabled={isRunning}
                onClick={() =>
                  guard(() => {
                    ensureClean();
                    download(
                      "mah-quantum-project.json",
                      JSON.stringify({ version: 2, name, program }, null, 2),
                      "application/json",
                    );
                  })
                }
              >
                Export JSON
              </button>
              <button
                disabled={isRunning}
                onClick={() => fileRef.current?.click()}
              >
                Import
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.qasm"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <div className="lab-toolbar">
            <div
              className="lab-tabs"
              role="tablist"
              aria-label="Workspace views"
            >
              {(
                [
                  "compose",
                  "code",
                  "inspect",
                  "transform",
                  "projects",
                  "jobs",
                  "guide",
                ] as Tab[]
              ).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                >
                  {
                    {
                      compose: "Composer",
                      code: "Code",
                      inspect: "Inspector",
                      transform: "Transpiler",
                      projects: "Projects",
                      jobs: "Jobs",
                      guide: "Guide",
                    }[t]
                  }
                  {t === "jobs" && <small>{jobs.length}</small>}
                </button>
              ))}
            </div>
            <label className="seed-control">
              Seed{" "}
              <input
                aria-label="Random seed"
                type="number"
                min="0"
                max="4294967295"
                value={seed}
                disabled={isRunning}
                onChange={(e) => setSeed(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="circuit-metrics">
            <span>
              <b>{program.qubits}</b> qubits
            </span>
            <span>
              <b>{program.bits}</b> classical bits
            </span>
            <span>
              <b>{stats.gates}</b> gates
            </span>
            <span>
              <b>{stats.depth}</b> depth
            </span>
            <span>
              <b>{stats.twoQubit}</b> multi-qubit operations
            </span>
            <span className="local-status">● Local worker engine</span>
          </div>
          {storageWarning && (
            <p className="lab-warning" role="status">
              Browser storage is unavailable or full. Your session works, but
              export JSON to keep it.
            </p>
          )}
          {dirty && (
            <div className="lab-warning">
              Unapplied code draft.{" "}
              <button onClick={() => setTab("code")}>Open code</button>
              <button
                disabled={isRunning}
                onClick={() => {
                  setSource(encode(program, format));
                  notice("Code draft discarded; circuit restored.");
                }}
              >
                Discard code draft
              </button>
            </div>
          )}
          {error && (
            <div className="lab-error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {message && (
            <div className="lab-notice" role="status">
              {message}
            </div>
          )}
          {isRunning && (
            <div className="job-progress" role="status">
              <span>Running locally · {Math.round(progress * 100)}%</span>
              <progress value={progress} max="1" />
              <button onClick={() => cancelRef.current?.()}>Cancel job</button>
            </div>
          )}
          {tab === "compose" && (
            <>
              <div className="examples-bar">
                <span>Load example</span>
                <select
                  aria-label="Example circuit"
                  defaultValue=""
                  disabled={isRunning}
                  onChange={(e) => {
                    if (e.target.value !== "")
                      loadExample(Number(e.target.value));
                    e.target.value = "";
                  }}
                >
                  <option value="" disabled>
                    Choose an algorithm…
                  </option>
                  {examples.map((ex, i) => (
                    <option key={i} value={i}>
                      {ex.name}
                    </option>
                  ))}
                </select>
                <span>
                  Click a gate, then + on a wire. Click a placed gate to edit
                  it.
                </span>
              </div>
              <div className="composer-shell">
                <fieldset className="composer-layout" disabled={isRunning}>
                  <Palette
                    selectedGate={selectedGate}
                    onSelectGate={setSelectedGate}
                    paramAngle={paramAngle}
                    onParamAngleChange={setParamAngle}
                  />
                  <div className="circuit-area">
                    <div className="circuit-toolbar">
                      <span>Circuit canvas</span>
                      <span>
                        {program.steps.length} / 256 operations · q[0] is the
                        least significant bit
                      </span>
                    </div>
                    <CircuitGrid
                      qubits={program.qubits}
                      steps={program.steps}
                      selectedGate={selectedGate}
                      paramAngle={paramAngle}
                      onAddStep={(s) =>
                        visualChange({
                          ...program,
                          steps: [...program.steps, s],
                        })
                      }
                      onRemoveStep={(id) =>
                        visualChange({
                          ...program,
                          steps: program.steps.filter((s) => s.id !== id),
                        })
                      }
                      onSelectStep={setSelectedId}
                      selectedId={selectedId ?? undefined}
                    />
                  </div>
                </fieldset>
                <OperationEditor
                  key={selectedId ?? "none"}
                  program={program}
                  selected={selectedId}
                  onChange={updateStep}
                  onDelete={() =>
                    visualChange({
                      ...program,
                      steps: program.steps.filter((s) => s.id !== selectedId),
                    })
                  }
                  onMove={moveStep}
                  onSelect={setSelectedId}
                  disabled={isRunning}
                />
              </div>
            </>
          )}
          {tab === "code" && (
            <CodeEditor
              source={source}
              format={format}
              onFormat={changeFormat}
              onChange={setSource}
              onApply={() =>
                guard(() => {
                  applyCode();
                })
              }
              onRun={run}
              onExport={exportCode}
              disabled={isRunning}
              dirty={dirty}
            />
          )}
          {tab === "inspect" && (
            <Inspector key={`${cursor}-${program.qubits}`} program={program} />
          )}
          {tab === "transform" && (
            <div className="lab-panel">
              <div className="panel-intro">
                <div>
                  <h3>Circuit transformation engine</h3>
                  <p>
                    Convert supported gates into U + CX, optionally route onto a
                    bidirectional linear chain. Logical qubit ordering is
                    restored after each routed gate.
                  </p>
                </div>
                <span className="lab-tag">LOCAL COMPILER</span>
              </div>
              <div className="transform-controls">
                <label>
                  <input
                    type="checkbox"
                    checked={linear}
                    onChange={(e) => {
                      setLinear(e.target.checked);
                      setTransformed(null);
                    }}
                  />{" "}
                  Linear connectivity: q0 — q1 — …
                </label>
                <div className="lab-actions">
                  <button
                    disabled={isRunning}
                    onClick={() =>
                      guard(() => {
                        ensureClean();
                        setTransformed({
                          program: optimize(program),
                          before: stats,
                          kind: "Adjacent inverse cancellation / rotation fusion",
                        });
                      })
                    }
                  >
                    Optimize circuit
                  </button>
                  <button
                    disabled={isRunning}
                    onClick={() =>
                      guard(() => {
                        ensureClean();
                        setTransformed({
                          program: transpile(program, linear),
                          before: stats,
                          kind: linear
                            ? "U + CX / linear routing"
                            : "U + CX / all-to-all",
                        });
                      })
                    }
                  >
                    Transpile to U + CX
                  </button>
                </div>
              </div>
              <p className="lab-muted">
                Transforms preserve ideal behavior up to global phase.
                Optimization changes noisy behavior because fewer physical
                operations incur fewer errors. This is not IBM backend ISA
                validation.
              </p>
              {transformed && (
                <>
                  <h4>{transformed.kind}</h4>
                  <div className="transform-summary">
                    Gates {transformed.before.gates} →{" "}
                    {circuitStats(transformed.program).gates}{" "}
                    <span>
                      Depth {transformed.before.depth} →{" "}
                      {circuitStats(transformed.program).depth}
                    </span>
                  </div>
                  <pre className="compiled-source">
                    {toQasm(transformed.program)}
                  </pre>
                  <div className="lab-actions">
                    <button
                      disabled={isRunning}
                      className="gold-action"
                      onClick={() =>
                        guard(() => {
                          ensureClean();
                          commit(transformed.program);
                          notice(
                            "Transformation applied. Undo restores the original circuit.",
                          );
                        })
                      }
                    >
                      Apply transformed circuit
                    </button>
                    <button
                      onClick={() =>
                        download(
                          "transformed.qasm",
                          toQasm(transformed.program),
                        )
                      }
                    >
                      Download QASM
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {tab === "projects" && (
            <div className="lab-panel">
              <div className="panel-intro">
                <div>
                  <h3>Your local project library</h3>
                  <p>
                    Up to 30 snapshots on this browser. Export JSON to back up
                    or move a project; clearing browser data removes local
                    saves.
                  </p>
                </div>
                <button onClick={saveProject} disabled={isRunning}>
                  Save current
                </button>
              </div>
              {projects.length === 0 ? (
                <p className="empty-lab">
                  No saved snapshots yet. Your current draft is autosaved
                  separately.
                </p>
              ) : (
                <div className="saved-list">
                  {projects.map((p) => (
                    <article key={p.id}>
                      <div>
                        <h4>{p.name}</h4>
                        <p>
                          {p.program.qubits} qubits · {p.program.steps.length}{" "}
                          operations · {new Date(p.updated).toLocaleString()}
                        </p>
                      </div>
                      <div className="lab-actions">
                        <button
                          disabled={isRunning}
                          onClick={() =>
                            guard(() => {
                              ensureClean();
                              commit(p.program);
                              setName(p.name);
                              setTab("compose");
                              notice("Project snapshot loaded.");
                            })
                          }
                        >
                          Open
                        </button>
                        <button
                          onClick={() =>
                            download(
                              "mah-quantum-project.json",
                              JSON.stringify({ version: 2, ...p }, null, 2),
                              "application/json",
                            )
                          }
                        >
                          Export
                        </button>
                        <button
                          onClick={() =>
                            setProjects((v) => v.filter((x) => x.id !== p.id))
                          }
                        >
                          Delete snapshot
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === "jobs" && (
            <div className="lab-panel">
              <div className="panel-intro">
                <div>
                  <h3>Local execution history</h3>
                  <p>
                    The latest 20 completed, failed or cancelled jobs. Each
                    stores its circuit, seed, shot count and noise settings.
                  </p>
                </div>
                <span className="lab-tag">ON THIS BROWSER</span>
              </div>
              {jobs.length === 0 ? (
                <p className="empty-lab">
                  Run a circuit or compile code to create your first job.
                </p>
              ) : (
                <div className="saved-list">
                  {jobs.map((j) => (
                    <article key={j.id}>
                      <div>
                        <h4>
                          {j.name}{" "}
                          <span className={`job-status ${j.status}`}>
                            {j.status}
                          </span>
                        </h4>
                        <p>
                          {j.shots.toLocaleString()} shots · seed {j.seed} ·{" "}
                          {j.noise.enabled ? "noise enabled" : "ideal"} ·{" "}
                          {new Date(j.created).toLocaleString()}
                        </p>
                        {j.error && <p className="danger-text">{j.error}</p>}
                      </div>
                      <div className="lab-actions">
                        {j.result && (
                          <button
                            disabled={isRunning}
                            onClick={() =>
                              guard(() => {
                                ensureClean();
                                commit(j.program);
                                setName(j.name);
                                setShots(j.shots);
                                setSeed(j.seed);
                                setNoise(j.noise);
                                setResult(j.result!);
                                notice(
                                  "Restored the circuit and its saved results.",
                                );
                              })
                            }
                          >
                            View results
                          </button>
                        )}
                        <button
                          disabled={isRunning}
                          onClick={() =>
                            guard(() => {
                              ensureClean();
                              commit(j.program);
                              setName(j.name);
                              setShots(j.shots);
                              setSeed(j.seed);
                              setNoise(j.noise);
                              void execute(
                                j.program,
                                j.shots,
                                j.seed,
                                j.noise,
                                j.name,
                              );
                            })
                          }
                        >
                          Re-run
                        </button>
                        <button
                          onClick={() =>
                            download(
                              "quantum-job.json",
                              JSON.stringify(j, null, 2),
                              "application/json",
                            )
                          }
                        >
                          Export job
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === "guide" && (
            <div className="lab-panel guide-grid">
              <article>
                <h3>From code to results</h3>
                <ol>
                  <li>Compose gates visually or write OpenQASM 2/3 in Code.</li>
                  <li>
                    Compile & run validates the program and executes in a Web
                    Worker.
                  </li>
                  <li>
                    Compare empirical shot frequencies with exact ideal
                    probabilities.
                  </li>
                  <li>
                    Inspect intermediate amplitudes, Bloch vectors, reduced
                    purity and Pauli expectations.
                  </li>
                  <li>
                    Optimize or transpile, then export QASM, Qiskit Python, JSON
                    or CSV.
                  </li>
                </ol>
              </article>
              <article>
                <h3>Free by design</h3>
                <p>
                  No account, API key, subscription or remote compute service is
                  needed. Your device executes the simulation. Drafts, projects
                  and jobs stay in browser storage.
                </p>
                <h3>Supported scope</h3>
                <p>
                  1–100 logical qubits (exact statevector ≤20; exact Clifford/separable/partitioned backends above 20), 256 expanded operations, up to 8,192 shots. Static
                  OpenQASM 2/3, one quantum and one classical register, terminal
                  measurements and the gates listed in Code. Results use
                  c[n−1]…c[0], or q[n−1]…q[0] when no measurements are
                  specified.
                </p>
              </article>
              <article>
                <h3>Honest boundaries</h3>
                <p>
                  No live IBM hardware, Qiskit Python runtime, Runtime
                  primitives, custom gate declarations, loops, reset, pulse
                  control or mid-circuit measurement. Unsupported instructions
                  are rejected. Qiskit is an export, not an installed execution
                  environment.
                </p>
                <p>
                  At large registers, only the strongest amplitudes and most significant outcomes are displayed; sampled outcomes remain exportable. Exact ideal simulation uses typed arrays and logarithmic-time measurement sampling. Large noisy trajectories may be rejected by the explicit browser work limit.
                </p>
                <p>
                  Noise is a generic model, not calibrated IBM hardware.
                  Inspection shows the ideal state before terminal measurement;
                  no invented fidelity score is reported for noisy jobs.
                </p>
              </article>
            </div>
          )}
        </section>
        <section className="results-section" aria-labelledby="results-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">EXECUTE / MEASURE / UNDERSTAND</p>
              <h2 id="results-title">
                Measurement results<span className="section-dot">.</span>
              </h2>
            </div>
            {result && (
              <div className="lab-actions">
                <button
                  onClick={() =>
                    download(
                      "quantum-results.csv",
                      "state,count,observed_probability,ideal_probability\n" +
                        Object.keys(result.probabilities)
                          .map(
                            (k) =>
                              `${k},${result.counts[k] ?? 0},${result.probabilities[k]},${result.idealProbabilities[k] ?? 0}`,
                          )
                          .join("\n"),
                      "text/csv",
                    )
                  }
                >
                  Export CSV
                </button>
                <button
                  onClick={() =>
                    download(
                      "quantum-results.json",
                      JSON.stringify(result, null, 2),
                      "application/json",
                    )
                  }
                >
                  Export JSON
                </button>
              </div>
            )}
          </div>
          <ExecutionPanel
            result={result}
            shots={result?.backendInfo.shots ?? shots}
            isRunning={isRunning}
          />
        </section>
        <footer className="studio-footer">
          <span>MAH QUANTUM™ / Devashri S Quantum</span>
          <span>
            MAH Quantum · Your workspace for quantum circuits and code
          </span>
        </footer>
      </main>
      <NoiseDialog
        open={noiseOpen}
        onClose={() => setNoiseOpen(false)}
        value={noise}
        onChange={(n) => {
          setNoise(n);
          setResult(null);
        }}
      />
    </div>
  );
};
