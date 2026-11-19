(() => {
  "use strict";

  const config = window.FLASHCARD_SYNC_CONFIG;
  const progress = window.FlashProgress;
  const sdkUrl = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
  const prefix = "zhongda-flashcards-cloud-v1:";
  const $ = (selector) => document.querySelector(selector);

  function start(hooks) {
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config?.projectUrl || "") ||
        !/^sb_publishable_[a-zA-Z0-9_-]+$/.test(config?.publishableKey || "")) return null;

    let client;
    let account = null;
    let timer;
    const panel = $("#cloudPanel");
    const status = $("#cloudStatus");
    const loginForm = $("#cloudLoginForm");
    const nickname = $("#cloudNickname");
    const importButton = $("#cloudImportButton");
    panel.hidden = false;

    function guestSnapshot() { return JSON.stringify(progress.normalize(hooks.getGuest())); }

    function renderAccount() {
      loginForm.hidden = Boolean(account);
      $("#cloudAccount").hidden = !account;
      if (!account) return;
      $("#cloudAccountName").textContent = account.snapshot.nickname?.value || "我的账号";
      $("#cloudAccountEmail").textContent = account.email;
      if (document.activeElement !== nickname) nickname.value = account.snapshot.nickname?.value || "";
      importButton.hidden = !progress.hasProgress(hooks.getGuest()) || account.imported === guestSnapshot();
    }

    function readAccount(id) {
      try {
        const cached = JSON.parse(localStorage.getItem(prefix + id) || "null");
        return { snapshot: progress.normalize(cached?.snapshot), imported: cached?.imported || null };
      } catch {
        return { snapshot: progress.empty(), imported: null };
      }
    }

    function persist(entry) {
      localStorage.setItem(prefix + entry.id, JSON.stringify({ snapshot: entry.snapshot, imported: entry.imported }));
    }

    function useSession(session) {
      const user = session?.user;
      if (user?.id === account?.id) {
        if (!account) status.textContent = "在手机和电脑上使用同一邮箱登录。";
        return;
      }
      clearTimeout(timer);
      account = user ? { id: user.id, email: user.email || "", ...readAccount(user.id) } : null;
      hooks.apply(account?.snapshot, account?.id);
      renderAccount();
      status.textContent = account ? "正在读取云端记录…" : "已退出登录。";
      if (account) void syncNow();
    }

    function publishLocal(entry, snapshot) {
      entry.snapshot = snapshot;
      persist(entry);
      hooks.apply(snapshot, entry.id);
      renderAccount();
    }

    // Revision matching prevents either device from overwriting an update between read and write.
    async function reconcile(entry) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const result = await client.from("flashcard_progress").select("revision,snapshot")
          .eq("user_id", entry.id).maybeSingle();
        if (entry !== account) return;
        if (result.error) throw result.error;

        const remote = progress.normalize(result.data?.snapshot);
        const merged = progress.merge(entry.snapshot, remote);
        const mergedJSON = JSON.stringify(merged);
        if (mergedJSON !== JSON.stringify(entry.snapshot)) publishLocal(entry, merged);
        if (mergedJSON === JSON.stringify(remote)) return;

        if (result.data) {
          const revision = result.data.revision;
          const updated = await client.from("flashcard_progress")
            .update({ snapshot: merged, revision: revision + 1 })
            .eq("user_id", entry.id).eq("revision", revision).select("revision").maybeSingle();
          if (updated.error) throw updated.error;
          if (updated.data) return;
        } else {
          const inserted = await client.from("flashcard_progress")
            .insert({ user_id: entry.id, snapshot: merged });
          if (!inserted.error) return;
          if (inserted.error.code !== "23505") throw inserted.error;
        }
        if (entry !== account) return;
      }
      throw new Error("Cloud revision changed repeatedly");
    }

    function syncNow() {
      clearTimeout(timer);
      const entry = account;
      if (!entry || !client) return Promise.resolve(false);
      if (entry.flight) {
        entry.runAgain = true;
        return entry.flight;
      }
      status.textContent = "正在同步…";
      entry.flight = reconcile(entry).then(() => {
        if (entry === account) status.textContent = "已同步";
        return true;
      }).catch(() => {
        if (entry === account) status.textContent = "暂时无法同步，记录已保存在本机。联网后可重试。";
        return false;
      }).finally(() => {
        entry.flight = null;
        if (entry === account && entry.runAgain) {
          entry.runAgain = false;
          queueSync();
        }
      });
      return entry.flight;
    }

    function queueSync() {
      clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), 500);
    }

    function edit(change) {
      if (!account) return null;
      const entry = account;
      const combined = progress.merge(entry.snapshot, readAccount(entry.id).snapshot);
      change(combined);
      entry.snapshot = progress.normalize(combined);
      persist(entry);
      status.textContent = "已保存到本机，等待同步。";
      queueSync();
      return entry.snapshot;
    }

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!client) return;
      const submit = $("#cloudLoginButton");
      const email = $("#cloudEmail");
      const password = $("#cloudPassword");
      submit.disabled = true;
      status.textContent = "正在登录…";
      try {
        const { data, error } = await client.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
        if (error || !data.session) throw error || new Error("Missing session");
        useSession(data.session);
      } catch {
        status.textContent = "登录失败，请核对邮箱和密码，或稍后重试。";
      } finally {
        password.value = "";
        submit.disabled = false;
      }
    });

    $("#cloudProfileForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const name = nickname.value.trim();
      if (!name || name.length > 24) {
        status.textContent = "请输入 1–24 个字符的昵称。";
        return;
      }
      edit((snapshot) => { snapshot.nickname = { value: name, at: Date.now() }; });
      nickname.value = name;
      renderAccount();
    });

    importButton.addEventListener("click", () => {
      if (!account) return;
      const legacy = progress.normalize(hooks.getGuest());
      const imported = JSON.stringify(legacy);
      if (account.snapshot.goal && legacy.goal?.at === 0) legacy.goal = null;
      account.imported = imported;
      publishLocal(account, progress.merge(account.snapshot, legacy));
      void syncNow();
    });

    $("#cloudSyncButton").addEventListener("click", () => void syncNow());
    $("#cloudLogoutButton").addEventListener("click", async () => {
      const button = $("#cloudLogoutButton");
      button.disabled = true;
      try {
        await syncNow();
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
        useSession(null);
      } catch {
        status.textContent = "暂时无法退出，请稍后重试。";
      } finally {
        button.disabled = false;
      }
    });
    window.addEventListener("online", () => void syncNow());
    window.addEventListener("storage", (event) => {
      if (!account || event.key !== prefix + account.id) return;
      const cached = readAccount(account.id);
      const merged = progress.merge(account.snapshot, cached.snapshot);
      const changed = JSON.stringify(merged) !== JSON.stringify(account.snapshot);
      if (cached.imported) account.imported = cached.imported;
      if (changed) publishLocal(account, merged);
      renderAccount();
      if (changed) queueSync();
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) void syncNow(); });
    setInterval(() => { if (!document.hidden && account) void syncNow(); }, 60_000);

    import(sdkUrl).then(({ createClient }) => {
      client = createClient(config.projectUrl, config.publishableKey, { auth: { detectSessionInUrl: false } });
      client.auth.onAuthStateChange((event, session) => setTimeout(() => useSession(session), 0));
      $("#cloudLoginButton").disabled = false;
    }).catch(() => { status.textContent = "登录服务暂时无法连接，仍可在本机背词。"; });

    return { edit, syncNow };
  }

  window.FlashCloud = { start };
})();
