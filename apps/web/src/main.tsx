import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import {ThemeProvider} from "./Theme";
import "./themes.css";
import WorkspaceAccess from "./WorkspaceAccess";
import {AccessProvider} from "./access/AccessProvider";
const Landing = lazy(() => import("./Landing"));
const Studio = lazy(() => import("./App").then((m) => ({ default: m.App })));
const LargeQuantum = lazy(() => import("./LargeQuantum"));
const Playground = lazy(() => import("./lab/Playground"));
const Lab = lazy(() => import("./lab/LabTwin"));
const Sensing = lazy(() => import("./lab/Sensing"));
const Communication = lazy(() => import("./lab/Communication"));
const path = window.location.pathname.replace(/\/$/, "");
const Content = path === '/studio' ? Studio : path === '/1000-plus' ? LargeQuantum : path === '/lab/operations' ? Lab : path === '/lab' ? Playground : path === '/sensing' ? Sensing : path === '/communication' ? Communication : Landing;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider><AccessProvider><Suspense
      fallback={
        <div
          style={{
            padding: 40,
            background: "#f7f9f4",
            color: "#172124",
            minHeight: "100vh",
          }}
        >
          Loading MAH Quantum…
        </div>
      }
    >
      {Content === Landing ? <Content /> : <WorkspaceAccess><Content /></WorkspaceAccess>}
    </Suspense></AccessProvider></ThemeProvider>
  </React.StrictMode>,
);
