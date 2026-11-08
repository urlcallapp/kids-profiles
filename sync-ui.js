/* sync-ui.js - gear-menu account & TV-pairing UI for Kids+ (additive).
 * Loaded by the bootstrap only when firebaseConfig is filled. Inserts one
 * button ("חשבון וסנכרון") into the app's existing #gearMenu and renders its
 * own overlay panel; touches nothing else. Hebrew/English follows app lang. */
export function initSyncUI(sync) {
  const STR = {
    he: {
      menu: "חשבון וסנכרון", title: "חשבון וסנכרון",
      blurb: "מתחברים כדי לסנכרן פרופילים בין הטלפון לטלוויזיה.",
      google: "התחברות עם Google", emailPh: "כתובת אימייל",
      sendLink: "שליחת קישור התחברות", linkSent: "נשלח! פתחו את המייל ולחצו על הקישור",
      signedInAs: "מחוברים", signOut: "התנתקות",
      pairThis: "קישור הטלוויזיה הזו לחשבון", pairingWait: "מכינים קוד…",
      codeTitle: "קוד קישור", codeHelp: "בטלפון: הגדרות ← חשבון וסנכרון ← הזנת הקוד",
      enterCode: "הזנת קוד מהטלוויזיה", codePh: "6 אותיות", approve: "אישור הקוד",
      pending: "מכשירים שממתינים לאישור", confirm: "אישור", dismiss: "דחייה",
      devices: "טלוויזיות מקושרות", revoke: "ניתוק", none: "אין מכשירים מקושרים",
      close: "סגירה", err: "משהו השתבש, נסו שוב", codeBad: "הקוד לא נמצא או שפג תוקפו",
      waitingConfirm: "הקוד אושר, ממתינים לאישור סופי בטלפון…",
      paired: "המכשיר קושר בהצלחה!",
      blurbTV: "מקשרים את הטלוויזיה לחשבון שמחובר בטלפון. בוחרים כאן 'קישור הטלוויזיה הזו לחשבון' ומזינים בטלפון את הקוד שיופיע.",
      conflictTitle: "במכשיר הזה שמורים פרופילים אחרים",
      conflictDevice: "במכשיר: ", conflictCloud: "בענן: ", conflictAsk: "מה לעשות?",
      conflictMerge: "מיזוג - להציג את כולם", conflictCloudOnly: "להשאיר את פרופילי הענן",
      conflictReplace: "להחליף את הענן בפרופילים מהמכשיר",
      conflictCancel: "ביטול והמשך ללא סנכרון", cancelOk: "ממשיכים ללא סנכרון - הפרופילים במכשיר נשמרו",
      confirmReplace: "הפרופילים בענן יוחלפו בפרופילים מהמכשיר. לאשר?",
      confirmYes: "אישור", confirmNo: "ביטול",
      mergedOk: "הפרופילים מוזגו!", replacedOk: "הפרופילים מהמכשיר הועתקו לענן",
    },
    en: {
      menu: "Account & sync", title: "Account & sync",
      blurb: "Sign in to sync profiles between phone and TV.",
      google: "Sign in with Google", emailPh: "Email address",
      sendLink: "Email me a sign-in link", linkSent: "Sent! Open the email and tap the link",
      signedInAs: "Signed in", signOut: "Sign out",
      pairThis: "Pair this TV to the account", pairingWait: "Preparing a code…",
      codeTitle: "Pairing code", codeHelp: "On the phone: Settings → Account & sync → enter the code",
      enterCode: "Enter the code from the TV", codePh: "6 letters", approve: "Approve code",
      pending: "Devices waiting for approval", confirm: "Approve", dismiss: "Dismiss",
      devices: "Linked TVs", revoke: "Unlink", none: "No linked devices",
      close: "Close", err: "Something went wrong, try again", codeBad: "Code not found or expired",
      waitingConfirm: "Code approved, waiting for final confirmation on the phone…",
      paired: "Device linked!",
      blurbTV: "Pair this TV with the account that's signed in on your phone. Choose 'Pair this TV to the account' here, then enter the code on your phone.",
      conflictTitle: "This device has different saved profiles",
      conflictDevice: "On device: ", conflictCloud: "In cloud: ", conflictAsk: "What would you like to do?",
      conflictMerge: "Merge - show all of them", conflictCloudOnly: "Keep the cloud profiles",
      conflictReplace: "Replace cloud with this device's profiles",
      conflictCancel: "Cancel and continue without sync", cancelOk: "Continuing without sync - device profiles kept",
      confirmReplace: "The cloud profiles will be replaced with this device's profiles. Confirm?",
      confirmYes: "Confirm", confirmNo: "Cancel",
      mergedOk: "Profiles merged!", replacedOk: "Device profiles copied to the cloud",
    },
  };
  const S = () => STR[document.documentElement.lang === "en" ? "en" : "he"] || STR.he;
  // The Android TV app serves the bundle from a fixed WebView origin. Google
  // and email sign-in cannot complete inside that WebView, so there the panel
  // leads with TV pairing instead of offering controls that would only error.
  const isTV = location.hostname === "appassets.androidplatform.net";

  const css = document.createElement("style");
  css.textContent = `
#syncPanel{position:fixed;inset:0;z-index:60;background:#000a;display:flex;align-items:center;justify-content:center;padding:20px}
#syncPanel .card{background:#1f1f23;border:1px solid #34343a;border-radius:16px;padding:20px;max-width:420px;width:100%;max-height:85vh;overflow:auto;color:#e8e8ea;display:flex;flex-direction:column}
#syncPanel .card>*{flex-shrink:0}
#syncPanel h2{font-size:20px;margin:0 0 6px}
#syncPanel h3{font-size:15px;margin:16px 0 8px;color:#b9b9c0}
#syncPanel p{font-size:14px;color:#b9b9c0;margin:4px 0 12px}
#syncPanel .row{display:flex;gap:8px;margin:8px 0}
#syncPanel input{flex:1;background:#141417;border:1px solid #34343a;border-radius:10px;color:#fff;padding:12px;font-size:16px}
#syncPanel button{background:#2c2c32;color:#fff;border-radius:10px;padding:12px 16px;font-size:15px}
#syncPanel button:active{transform:scale(.96)}
#syncPanel button.pri{background:#1db5d8;color:#04222a;font-weight:700}
#syncPanel .code{font-size:40px;letter-spacing:10px;text-align:center;font-weight:800;padding:14px;background:#141417;border-radius:12px;margin:8px 0;direction:ltr}
#syncPanel .dev{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-top:1px solid #2c2c32;font-size:14px}
#syncPanel .dev .id{direction:ltr;color:#9a9aa2;font-size:12px}
#syncPanel .msg{font-size:14px;min-height:18px;color:#7fd8ea}
#syncPanel .x{width:100%;margin-top:14px;position:sticky;bottom:-20px;background:#1f1f23;padding-top:12px;padding-bottom:12px}`;
  document.head.appendChild(css);

  const panel = document.createElement("div");
  panel.id = "syncPanel";
  panel.hidden = true;
  document.body.appendChild(panel);

  const menuBtn = document.createElement("button");
  menuBtn.id = "gmSync";
  const gearMenu = document.getElementById("gearMenu");
  if (gearMenu) gearMenu.appendChild(menuBtn);
  const syncMenuLabel = () => { menuBtn.textContent = S().menu; };
  syncMenuLabel();

  let unwatch = null;
  let pairing = null; // {code, done}
  let conflictDismissed = false; // session-only; backup itself is kept
  function msg2(m) { const n = document.getElementById("syncMsg"); if (n) n.textContent = m; }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function render() {
    syncMenuLabel();
    const s = S();
    panel.innerHTML = "";
    const card = el("div", "card");
    panel.appendChild(card);
    card.appendChild(el("h2", null, s.title));
    // While a first-sync conflict is unresolved the chooser is BLOCKING: no
    // Close, no backdrop dismiss (tv-mode also refuses Back) - the owner must
    // pick merge / keep cloud / replace before cloud data can appear.
    const blocking = !conflictDismissed && !window.KPconflictResolved && sync.signedIn && sync.hasLocalBackup && sync.hasLocalBackup();
    panel.classList.toggle("blocking", !!blocking);

    if (!sync.signedIn) {
      card.appendChild(el("p", null, isTV ? s.blurbTV : s.blurb));
      if (!isTV) {
        const g = el("button", "pri", s.google);
        g.onclick = async () => { msg.textContent = ""; try { await sync.signInWithGoogle(); render(); } catch (e) { msg.textContent = s.err; } };
        card.appendChild(g);
        const row = el("div", "row");
        const inp = el("input"); inp.type = "email"; inp.placeholder = s.emailPh; inp.dir = "ltr";
        const send = el("button", null, s.sendLink);
        send.onclick = async () => {
          msg.textContent = "";
          try { await sync.sendEmailLink(inp.value.trim()); msg.textContent = s.linkSent; }
          catch (e) { msg.textContent = s.err; }
        };
        row.append(inp, send);
        card.appendChild(row);
      }
      // Pairing without an account (TV first step) also lives here:
      const pr = el("button", isTV ? "pri" : null, s.pairThis);
      pr.onclick = startPairing;
      card.appendChild(pr);
    } else {
      card.appendChild(el("p", null, s.signedInAs + ": " + (sync.accountId || "").slice(0, 10) + "…"));
      // Local profiles differ from the cloud: explicit choice, nothing is
      // silently overwritten or lost. Backup stays until the owner picks
      // merge or replace; "keep cloud" only hides this card for the session
      // (the backup is re-made on the next sign-in while data still differs).
      if (!conflictDismissed && sync.hasLocalBackup && sync.hasLocalBackup()) {
        const info = sync.getLocalBackupInfo ? sync.getLocalBackupInfo() : null;
        const cloudNames = sync.cloudProfileNames ? sync.cloudProfileNames() : null;
        const box = el("div"); box.style.cssText = "border:1px solid #34343a;border-radius:12px;padding:12px;margin:10px 0";
        box.appendChild(el("h3", null, s.conflictTitle));
        box.appendChild(el("p", null, s.conflictDevice + (info && info.names.length ? info.names.join(", ") : "?")));
        box.appendChild(el("p", null, s.conflictCloud + (cloudNames && cloudNames.length ? cloudNames.join(", ") : "?")));
        box.appendChild(el("p", null, s.conflictAsk));
        const mrg = el("button", "pri", s.conflictMerge);
        mrg.style.width = "100%"; mrg.style.marginBottom = "8px";
        mrg.onclick = async () => {
          msg.textContent = "";
          try { await sync.mergeLocalInstead(); conflictDismissed = true; window.KPconflictResolved = true; window.KPheldState = null; render(); msg2(s.mergedOk); }
          catch (e) { msg.textContent = s.err; }
        };
        box.appendChild(mrg);
        const keep = el("button", null, s.conflictCloudOnly);
        keep.style.width = "100%"; keep.style.marginBottom = "8px";
        keep.onclick = () => {
          conflictDismissed = true; window.KPconflictResolved = true;
          const held = window.KPheldState; window.KPheldState = null;
          if (held && window.KPonRemote) window.KPonRemote(held); // owner chose: cloud may appear now
          panel.hidden = true;
        };
        box.appendChild(keep);
        const rep = el("button", null, s.conflictReplace);
        rep.style.width = "100%";
        rep.onclick = () => {
          // Destructive to the cloud copy: requires an explicit second tap.
          box.innerHTML = "";
          box.appendChild(el("p", null, s.confirmReplace));
          const yes = el("button", "pri", s.confirmYes);
          yes.style.width = "100%"; yes.style.marginBottom = "8px";
          yes.onclick = async () => {
            msg.textContent = "";
            try { await sync.useLocalInstead(); conflictDismissed = true; window.KPconflictResolved = true; window.KPheldState = null; render(); msg2(s.replacedOk); }
            catch (e) { msg.textContent = s.err; }
          };
          const no = el("button", null, s.confirmNo);
          no.style.width = "100%";
          no.onclick = () => render();
          box.append(yes, no);
        };
        box.appendChild(rep);
        // Safe escape: disconnect and keep using the device local-only. No
        // cloud write, no local change - the local view was never replaced,
        // and sign-out restores base localStorage. The conflict re-prompts on
        // the next sign-in while the data still differs.
        const cxl = el("button", null, s.conflictCancel);
        cxl.style.width = "100%"; cxl.style.marginTop = "8px";
        cxl.onclick = async () => {
          msg.textContent = "";
          try { await sync.signOut(); } catch (e) {}
          panel.hidden = true;
          msg2(s.cancelOk);
        };
        box.appendChild(cxl);
        card.appendChild(box);
      }
      if (pairing && pairing.code) {
        card.appendChild(el("h3", null, s.codeTitle));
        card.appendChild(el("div", "code", pairing.code));
        card.appendChild(el("p", null, s.codeHelp));
      } else {
        const pr = el("button", null, s.pairThis);
        pr.onclick = startPairing;
        card.appendChild(pr);
      }
      const crow = el("div", "row");
      const cinp = el("input"); cinp.placeholder = s.codePh; cinp.maxLength = 6; cinp.dir = "ltr"; cinp.style.textTransform = "uppercase";
      const cbtn = el("button", "pri", s.approve);
      cbtn.onclick = async () => {
        msg.textContent = "";
        try { await sync.approveTvCode(cinp.value); msg.textContent = "✓"; cinp.value = ""; }
        catch (e) { msg.textContent = s.codeBad; }
      };
      crow.append(cinp, cbtn);
      card.appendChild(el("h3", null, s.enterCode));
      card.appendChild(crow);

      card.appendChild(el("h3", null, s.pending));
      const plist = el("div"); plist.id = "syncPending";
      card.appendChild(plist);
      card.appendChild(el("h3", null, s.devices));
      const dlist = el("div"); dlist.id = "syncDevices";
      card.appendChild(dlist);
      renderDevices();

      const out = el("button", null, s.signOut);
      out.style.marginTop = "14px";
      out.onclick = async () => { try { await sync.signOut(); } catch (e) {} pairing = null; render(); };
      card.appendChild(out);
    }
    const msg = el("div", "msg"); msg.id = "syncMsg";
    card.appendChild(msg);
    if (!blocking) {
      const x = el("button", "x", s.close);
      x.onclick = () => { panel.hidden = true; };
      card.appendChild(x);
    }

    function startPairing() {
      msg.textContent = s.pairingWait;
      sync.beginTvPairing().then((p) => {
        pairing = p;
        msg.textContent = "";
        render();
        p.done.then(() => { pairing = null; msg2(s.paired); render(); })
              .catch((e) => { pairing = null; msg2(e && e.message || s.err); render(); });
      }).catch(() => { msg.textContent = s.err; });
      function msg2(m) { const n = document.getElementById("syncMsg"); if (n) n.textContent = m; }
    }
  }

  function renderDevices() {
    const s = S();
    const plist = document.getElementById("syncPending");
    const dlist = document.getElementById("syncDevices");
    if (!plist || !dlist) return;
    if (unwatch) { unwatch(); unwatch = null; }
    const confirmed = new Set(sync.pairedDeviceIds || []);
    try {
      unwatch = sync.watchPendingDevices((devs) => {
        plist.innerHTML = ""; dlist.innerHTML = "";
        let anyDev = false;
        devs.forEach((d) => {
          if (confirmed.has(d.deviceUid)) {
            anyDev = true;
            const row = el("div", "dev");
            row.appendChild(el("span", null, "📺 "));
            row.appendChild(el("span", "id", d.deviceUid.slice(0, 8) + "…"));
            const rv = el("button", null, s.revoke);
            rv.onclick = async () => { try { await sync.revokeTvDevice(d.deviceUid); } catch (e) {} };
            row.appendChild(rv);
            dlist.appendChild(row);
          } else {
            const row = el("div", "dev");
            row.appendChild(el("span", null, "📺 "));
            row.appendChild(el("span", "id", d.deviceUid.slice(0, 8) + "…"));
            const ok = el("button", "pri", s.confirm);
            ok.onclick = async () => { try { await sync.confirmPairedDevice(d.deviceUid); } catch (e) {} };
            const no = el("button", null, s.dismiss);
            no.onclick = async () => { try { await sync.revokeTvDevice(d.deviceUid); } catch (e) {} };
            const wrap = el("div", "row"); wrap.style.margin = "0"; wrap.append(ok, no);
            row.appendChild(wrap);
            plist.appendChild(row);
          }
        });
        if (!anyDev) dlist.appendChild(el("p", null, s.none));
      });
    } catch (e) { /* signed out mid-render */ }
  }

  menuBtn.onclick = () => {
    const gm = document.getElementById("gearMenu");
    if (gm) gm.hidden = true;
    render();
    panel.hidden = false;
  };
  panel.onclick = (e) => { if (e.target === panel && !panel.classList.contains("blocking")) panel.hidden = true; };

  // The app's hold-and-ask hook: called when cloud data wants to replace the
  // visible picker while this device has different local profiles.
  window.KPshowConflict = () => { conflictDismissed = false; render(); panel.hidden = false; };
  // If the conflict fired before this module finished loading, surface it now.
  setTimeout(() => { if (window.KPheldState && !window.KPconflictResolved) window.KPshowConflict(); }, 0);

  // Complete email-link sign-in when the app was opened from the link.
  if (sync.completeEmailLinkIfPresent) sync.completeEmailLinkIfPresent().then((ok) => { if (ok) render(); }).catch(() => {});
  // Refresh labels when the app language flips.
  new MutationObserver(syncMenuLabel).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
}
