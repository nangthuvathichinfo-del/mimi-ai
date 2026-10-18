import { t } from "../i18n";
import { lazy, Suspense, useEffect, useRef } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { configureApi, flushQueue } from "../api/client";
import { UndoProvider } from "../components/AppShell";
import { AuthProvider, useAuth } from "../lib/auth";
import { queryClient, queryPersister } from "./queryClient";
import { Welcome } from "../screens/Welcome";
import { Home } from "../screens/Home";

// Màn ít vào ngay được tách bundle riêng để lần mở đầu nhẹ.
const Items = lazy(() => import("../screens/Items").then((m) => ({ default: m.Items })));
const ItemDetail = lazy(() => import("../screens/ItemDetail").then((m) => ({ default: m.ItemDetail })));
const Scan = lazy(() => import("../screens/Scan").then((m) => ({ default: m.Scan })));
const Stub = lazy(() => import("../screens/Stub").then((m) => ({ default: m.Stub })));
const Account = lazy(() => import("../screens/Stub").then((m) => ({ default: m.Account })));
const TodayMeal = lazy(() => import("../screens/Stub").then((m) => ({ default: m.TodayMeal })));

function Gate() {
  const auth = useAuth();
  const wasSignedOut = useRef<boolean | null>(null);

  useEffect(() => {
    configureApi({
      getToken: auth.idToken,
      onUnauthorized: () => auth.signOut(), // 401: về màn đăng nhập (spec mục 1)
    });
  }, [auth]);

  useEffect(() => {
    if (!auth.session) return;
    flushQueue();
    const onOnline = () => flushQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [auth.session]);

  if (!auth.ready) return null;
  if (wasSignedOut.current === null) wasSignedOut.current = !auth.session;
  if (!auth.session) {
    wasSignedOut.current = true;
    return (
      <Routes>
        <Route path="*" element={<Welcome />} />
      </Routes>
    );
  }

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Home entering={wasSignedOut.current === true} />} />
        <Route path="/items" element={<Items />} />
        <Route path="/items/:key" element={<ItemDetail />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/spending" element={<Stub title={t.stub.spending} section="3" />} />
        <Route path="/plan" element={<Stub title={t.stub.plan} section="5" />} />
        <Route path="/settings" element={<Stub title={t.stub.settings} section="6" />} />
        <Route path="/settings/account" element={<Account />} />
        <Route path="/notifications" element={<Stub title={t.stub.notifications} section="6" sub />} />
        <Route path="/today" element={<TodayMeal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: 7 * 24 * 60 * 60 * 1000 }}>
      <AuthProvider>
        <BrowserRouter>
          <UndoProvider>
            <Gate />
          </UndoProvider>
        </BrowserRouter>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
