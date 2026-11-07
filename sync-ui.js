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
    },
  };
  const S = () => STR[document.documentElement.lang === "en" ? "en" : "he"] || STR.he;

  const css = document.createElement("style");
  css.textContent = `
#syncPanel{position:fixed;inset:0;z-index:60;background:#000a;display:flex;align-items:center;justify-content:center;padding:20px}
#syncPanel .card{background:#1f1f23;border:1px solid #34343a;border-radius:16px;padding:20px;max-width:420px;width:100%;max-height:85vh;overflow:auto;color:#e8e8ea}
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
#syncPanel .x{width:100%;margin-top:14px}`;
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

    if (!sync.signedIn) {
      card.appendChild(el("p", null, s.blurb));
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
      // Pairing without an account (TV first step) also lives here:
      const pr = el("button", null, s.pairThis);
      pr.onclick = startPairing;
      card.appendChild(pr);
    } else {
      card.appendChild(el("p", null, s.signedInAs + ": " + (sync.accountId || "").slice(0, 10) + "…"));
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
    const x = el("button", "x", s.close);
    x.onclick = () => { panel.hidden = true; };
    card.appendChild(x);

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
  panel.onclick = (e) => { if (e.target === panel) panel.hidden = true; };

  // Complete email-link sign-in when the app was opened from the link.
  if (sync.completeEmailLinkIfPresent) sync.completeEmailLinkIfPresent().then((ok) => { if (ok) render(); }).catch(() => {});
  // Refresh labels when the app language flips.
  new MutationObserver(syncMenuLabel).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
}
