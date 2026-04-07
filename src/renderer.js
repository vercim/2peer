// ── DOM ───────────────────────────────────────────────────────────────────────
const selfIdEl            = document.getElementById('selfId');
const remoteIdInput       = document.getElementById('remoteIdInput');
const callBtn             = document.getElementById('callBtn');
const hangupBtn           = document.getElementById('hangupBtn');
const copyIdBtn           = document.getElementById('copyIdBtn');
const regenIdBtn          = document.getElementById('regenIdBtn');
const statusText          = document.getElementById('statusText');
const localVideo          = document.getElementById('localVideo');
const remoteVideo         = document.getElementById('remoteVideo');
const localMeta           = document.getElementById('localMeta');
const remoteMeta          = document.getElementById('remoteMeta');
const serverTag           = document.getElementById('serverTag');
const incomingCallEl      = document.getElementById('incomingCall');
const callerIdLabel       = document.getElementById('callerIdLabel');
const sourcePickerOverlay = document.getElementById('sourcePickerOverlay');
const sourcePickerContent = document.getElementById('sourcePickerContent');
const confirmOverlay      = document.getElementById('confirmOverlay');
const confirmMsg          = document.getElementById('confirmMsg');
const confirmOk           = document.getElementById('confirmOk');
const confirmCancel       = document.getElementById('confirmCancel');

// ── State ─────────────────────────────────────────────────────────────────────
let selfId           = '';
let currentPeerId    = '';
let supabaseClient   = null;
let myChannel        = null;
let supabaseConfig   = null;
let pc               = null;
let localStream      = null;
let pendingIce       = [];
let isPolite         = false;
let incomingCallData = null;
let reconnectTimer   = null;

const rtcConfig = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

// ── Window controls ───────────────────────────────────────────────────────────
document.getElementById('btnMinimize').addEventListener('click', () => window.electronAPI.minimizeWindow());
document.getElementById('btnClose').addEventListener('click',    () => window.electronAPI.closeWindow());

// ── Confirm dialog ────────────────────────────────────────────────────────────
function showConfirm(message) {
  return new Promise((resolve) => {
    confirmMsg.innerHTML = message;
    confirmOverlay.classList.remove('hidden');
    const onOk     = () => { cleanup(); resolve(true);  };
    const onCancel = () => { cleanup(); resolve(false); };
    function cleanup() {
      confirmOverlay.classList.add('hidden');
      confirmOk.removeEventListener('click', onOk);
      confirmCancel.removeEventListener('click', onCancel);
    }
    confirmOk.addEventListener('click', onOk);
    confirmCancel.addEventListener('click', onCancel);
  });
}

// ── Source picker ─────────────────────────────────────────────────────────────
function showSourcePicker() {
  return new Promise(async (resolve) => {
    const sources = await window.electronAPI.getSources();
    sourcePickerContent.innerHTML = '';
    const screens = sources.filter(s => s.isScreen);
    const windows = sources.filter(s => !s.isScreen);

    function renderSection(label, items) {
      if (!items.length) return;
      const lbl = document.createElement('div');
      lbl.className = 'source-section-label';
      lbl.textContent = label;
      sourcePickerContent.appendChild(lbl);
      const grid = document.createElement('div');
      grid.className = 'source-grid';
      items.forEach(src => {
        const item = document.createElement('div');
        item.className = 'source-item';
        item.innerHTML = `
          <img class="source-thumb" src="${src.thumbnail}" alt="" />
          <div class="source-name">${src.name}</div>
        `;
        item.addEventListener('click', async () => {
          await window.electronAPI.setPendingSource(src.id);
          sourcePickerOverlay.classList.add('hidden');
          resolve(src.id);
        });
        grid.appendChild(item);
      });
      sourcePickerContent.appendChild(grid);
    }

    renderSection('Экраны', screens);
    renderSection('Окна', windows);
    sourcePickerOverlay.classList.remove('hidden');

    const closeBtn = document.getElementById('sourcePickerClose');
    const onClose = () => {
      sourcePickerOverlay.classList.add('hidden');
      closeBtn.removeEventListener('click', onClose);
      resolve(null);
    };
    closeBtn.addEventListener('click', onClose);
  });
}

document.getElementById('pickSourceBtn').addEventListener('click', async () => {
  const sourceId = await showSourcePicker();
  if (!sourceId) return;
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    localVideo.srcObject = null;
  }
  try {
    await ensureLocalScreen();
    if (pc) {
      const senders = pc.getSenders();
      const [newTrack] = localStream.getVideoTracks();
      for (const sender of senders) {
        if (sender.track && sender.track.kind === 'video') {
          await sender.replaceTrack(newTrack);
          setTimeout(() => applyMaxQualityEncoding(sender), 400);
        }
      }
    }
    setStatus('Источник трансляции изменён.');
  } catch(e) {
    setStatus(e.message || 'Не удалось захватить экран.', true);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(msg, isErr = false) {
  statusText.innerHTML = isErr
    ? `<span style="color:#b44">${msg}</span>`
    : msg;
}

function cleanupLocalStream() {
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  localVideo.srcObject = null;
  localMeta.textContent = '—';
}

function cleanupRemoteStream() {
  remoteVideo.srcObject = null;
  remoteMeta.textContent = '—';
}

// ── Screen capture ────────────────────────────────────────────────────────────
async function ensureLocalScreen() {
  if (localStream && localStream.active) return localStream;

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width:     { ideal: 7680, max: 7680 },
      height:    { ideal: 4320, max: 4320 },
      frameRate: { ideal: 60,   max: 60   },
      displaySurface: 'monitor'
    },
    audio: false,
    selfBrowserSurface: 'exclude'
  });

  const [track] = stream.getVideoTracks();
  track.contentHint = 'detail';
  await track.applyConstraints({
    width: { ideal: 7680 }, height: { ideal: 4320 }, frameRate: { ideal: 60, max: 60 }
  }).catch(() => {});

  track.onended = () => { setStatus('Трансляция остановлена.'); hangup(false); };

  localStream = stream;
  localVideo.srcObject = stream;

  const s = track.getSettings ? track.getSettings() : {};
  localMeta.textContent = `${s.width||'?'}×${s.height||'?'} @${Math.round(s.frameRate||60)}fps`;
  return stream;
}

// ── Quality encoding ──────────────────────────────────────────────────────────
function applyMaxQualityEncoding(sender) {
  if (!sender || sender.track?.kind !== 'video') return;
  const params = sender.getParameters();
  params.encodings ??= [{}];
  const s = sender.track?.getSettings?.() || {};
  const pixels = (s.width || 1920) * (s.height || 1080);
  let maxBitrate;
  if      (pixels >= 3840 * 2160) maxBitrate = 80_000_000;
  else if (pixels >= 2560 * 1440) maxBitrate = 40_000_000;
  else if (pixels >= 1920 * 1080) maxBitrate = 20_000_000;
  else                             maxBitrate = 15_000_000;

  params.encodings.forEach(enc => {
    enc.maxBitrate            = maxBitrate;
    enc.maxFramerate          = 60;
    enc.scaleResolutionDownBy = 1.0;
    enc.priority              = 'high';
    enc.networkPriority       = 'high';
  });
  sender.setParameters(params).catch(console.error);
}

// ── PeerConnection ────────────────────────────────────────────────────────────
function createPeerConnection(peerId) {
  currentPeerId = peerId;
  pc = new RTCPeerConnection(rtcConfig);
  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
    const s = event.track.getSettings ? event.track.getSettings() : {};
    remoteMeta.textContent = `${s.width||'?'}×${s.height||'?'} @${Math.round(s.frameRate||'?')}fps`;
    setStatus(`Подключено к <strong style="font-family:monospace">${peerId}</strong>.`);
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate && currentPeerId) send({ type: 'candidate', to: currentPeerId, candidate });
  };

  pc.onconnectionstatechange = () => {
    const st = pc?.connectionState;
    console.log('[connectionState]', st);
    if (st === 'connected')    setStatus(`Соединение активно с <strong style="font-family:monospace">${currentPeerId}</strong>.`);
    if (st === 'failed')       setStatus('P2P соединение не удалось.', true);
    if (st === 'disconnected') setStatus('Соединение потеряно.');
    if (st === 'closed')       setStatus('Соединение закрыто.');
  };

  pc.oniceconnectionstatechange = () => {
    console.log('[iceConnectionState]', pc?.iceConnectionState);
    if (pc?.iceConnectionState === 'failed') pc.restartIce();
  };

  return pc;
}

async function attachLocalTracks() {
  const stream = await ensureLocalScreen();
  const existing = new Set((pc.getSenders() || []).map(s => s.track?.id).filter(Boolean));
  for (const track of stream.getTracks()) {
    if (!existing.has(track.id)) {
      const sender = pc.addTrack(track, stream);
      setTimeout(() => applyMaxQualityEncoding(sender), 500);
    }
  }
}

// ── Supabase Signaling ────────────────────────────────────────────────────────
// ── Supabase Signaling ────────────────────────────────────────────────────────
let outChannel = null; // постоянный канал для отправки текущему пиру

async function connectSupabase(url, key) {
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    serverTag.textContent = 'Supabase Realtime';
  }

  if (myChannel) {
    try { await supabaseClient.removeChannel(myChannel); } catch (_) {}
    myChannel = null;
    await new Promise(r => setTimeout(r, 200));
  }

  myChannel = supabaseClient.channel(`peer:${selfId}`, {
    config: { broadcast: { self: false } }
  });

  myChannel
    .on('broadcast', { event: 'signal' }, ({ payload }) => {
      handleSignal(payload).catch(e => setStatus(e.message || 'Ошибка сигналинга.', true));
    })
    .subscribe((status) => {
      console.log('[Supabase] status:', status);
      if (status === 'SUBSCRIBED') {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        setStatus('Готово. Поделитесь ID и нажмите «Позвонить».');
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setStatus('Переподключение к сигналингу...');
        if (!reconnectTimer && supabaseConfig) {
          reconnectTimer = setTimeout(async () => {
            reconnectTimer = null;
            await connectSupabase(supabaseConfig.supabaseUrl, supabaseConfig.supabaseKey).catch(() => {});
          }, 2000);
        }
      }
    });
}

// Создаём исходящий канал к пиру один раз и переиспользуем
async function ensureOutChannel(peerId) {
  if (outChannel && outChannel._topic === `realtime:peer:${peerId}`) return;

  if (outChannel) {
    try { await supabaseClient.removeChannel(outChannel); } catch (_) {}
    outChannel = null;
  }

  const ch = supabaseClient.channel(`peer:${peerId}`, {
    config: { broadcast: { self: false } }
  });

  console.log('[ensureOutChannel] subscribing to peer:', peerId);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Не удалось подключиться к собеседнику (timeout)')), 8000);
    ch.subscribe((status) => {
      console.log('[ensureOutChannel] subscribe status:', status);
      if (status === 'SUBSCRIBED')   { clearTimeout(timer); outChannel = ch; resolve(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { clearTimeout(timer); reject(new Error('Не удалось подключиться к собеседнику (' + status + ')')); }
    });
  });
}

async function send(payload) {
  if (!supabaseClient) { setStatus('Нет подключения к Supabase.', true); return; }
  try {
    console.log('[send] ensuring channel to', payload.to);
    await ensureOutChannel(payload.to);
    console.log('[send] sending payload', payload.type);
    await outChannel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { ...payload, from: selfId }
    });
    console.log('[send] done');
  } catch (e) {
    console.error('[send error]', e.message);
    setStatus('Ошибка отправки: ' + e.message, true);
  }
}

async function handleSignal(msg) {
  console.log('[signal received]', msg.type, 'from', msg.from);
  
  if (msg.type === 'call')      handleIncomingCall(msg);
  if (msg.type === 'answer')    await handleAnswer(msg);
  if (msg.type === 'candidate') await handleCandidate(msg);
  if (msg.type === 'decline') {
    setStatus(`<strong style="font-family:monospace">${msg.from}</strong> отклонил звонок.`);
    hangup(false);
  }
  if (msg.type === 'hangup') {
    setStatus(`<strong style="font-family:monospace">${msg.from}</strong> завершил звонок.`);
    hangup(false);
  }
  if (msg.type === 'error') setStatus(msg.message, true);
}

// ── Call flow ─────────────────────────────────────────────────────────────────
async function startCall() {
  const peerId = remoteIdInput.value.trim();
  if (!peerId) { setStatus('Введите ID собеседника.', true); return; }
  const ok = await showConfirm(`Позвонить <strong>${peerId}</strong>?`);
  if (!ok) return;
  hangup(false);
  isPolite = false;
  createPeerConnection(peerId);
  await attachLocalTracks();
  await pc.setLocalDescription(await pc.createOffer({ offerToReceiveVideo: true }));
  send({ type: 'call', to: peerId, offer: pc.localDescription });
  setStatus(`Вызываем <strong style="font-family:monospace">${peerId}</strong>...`);
}

function handleIncomingCall({ from, offer }) {
  incomingCallData = { from, offer };
  incomingCallEl.classList.add('active');
  callerIdLabel.textContent = from;
  setStatus(`Входящий звонок от <strong style="font-family:monospace">${from}</strong>.`);
}

async function acceptCall() {
  if (!incomingCallData) return;
  const { from, offer } = incomingCallData;
  incomingCallData = null;
  incomingCallEl.classList.remove('active');
  if (pc) { pc.getSenders().forEach(s => s.track?.stop()); pc.close(); pc = null; }
  isPolite = true;
  createPeerConnection(from);
  await attachLocalTracks();
  await pc.setRemoteDescription(offer);
  for (const c of pendingIce) await pc.addIceCandidate(c);
  pendingIce = [];
  await pc.setLocalDescription(await pc.createAnswer());
  send({ type: 'answer', to: from, answer: pc.localDescription });
  setStatus(`Звонок принят. Подключаемся к <strong style="font-family:monospace">${from}</strong>...`);
}

function declineCall() {
  if (!incomingCallData) return;
  const { from } = incomingCallData;
  incomingCallData = null;
  incomingCallEl.classList.remove('active');
  send({ type: 'decline', to: from });
  setStatus(`Вызов от <strong style="font-family:monospace">${from}</strong> отклонён.`);
}

async function handleAnswer({ from, answer }) {
  if (!pc) return;
  await pc.setRemoteDescription(answer);
  pc.getSenders().forEach(applyMaxQualityEncoding);
  setStatus(`<strong style="font-family:monospace">${from}</strong> принял звонок.`);
}

async function handleCandidate({ candidate }) {
  if (!candidate) return;
  if (!pc || !pc.remoteDescription) { pendingIce.push(candidate); return; }
  try { await pc.addIceCandidate(candidate); } catch (_) {}
}

function hangup(notify = true) {
  if (notify && currentPeerId) send({ type: 'hangup', to: currentPeerId });
  if (outChannel) {
    supabaseClient?.removeChannel(outChannel).catch(() => {});
    outChannel = null;
  }
  if (pc) { pc.getSenders().forEach(s => s.track?.stop()); pc.close(); }
  pc = null;
  currentPeerId = '';
  pendingIce = [];
  incomingCallData = null;
  incomingCallEl.classList.remove('active');
  cleanupLocalStream();
  cleanupRemoteStream();
}

// ── PiP & Fullscreen ──────────────────────────────────────────────────────────
document.getElementById('pipBtn').addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await remoteVideo.requestPictureInPicture();
  } catch(e) {
    setStatus('PiP не поддерживается для этого источника.', true);
  }
});

document.getElementById('fullscreenBtn').addEventListener('click', () => {
  if (remoteVideo.requestFullscreen) remoteVideo.requestFullscreen();
  else if (remoteVideo.webkitRequestFullscreen) remoteVideo.webkitRequestFullscreen();
});

remoteVideo.addEventListener('dblclick', () => {
  if (remoteVideo.requestFullscreen) remoteVideo.requestFullscreen();
});
localVideo.addEventListener('dblclick', () => {
  if (localVideo.requestFullscreen) localVideo.requestFullscreen();
});

// ── Event listeners ───────────────────────────────────────────────────────────
copyIdBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(selfId);
  setStatus('ID скопирован.');
});

regenIdBtn.addEventListener('click', async () => {
  const ok = await showConfirm('Сбросить ID? Текущий ID станет недоступен.');
  if (!ok) return;
  try {
    if (myChannel) {
      await supabaseClient.removeChannel(myChannel).catch(() => {});
      myChannel = null;
      await new Promise(r => setTimeout(r, 200));
    }
    const profile = await window.electronAPI.regenerateProfile();
    selfId = profile.id;
    selfIdEl.textContent = selfId;
    await connectSupabase(supabaseConfig.supabaseUrl, supabaseConfig.supabaseKey);
    setStatus('Создан новый ID.');
  } catch (e) {
    setStatus(e.message || 'Не удалось сменить ID.', true);
  }
});

callBtn.addEventListener('click', () => {
  startCall().catch(e => setStatus(e.message || 'Ошибка вызова.', true));
});

hangupBtn.addEventListener('click', async () => {
  if (!currentPeerId && !pc) { setStatus('Нет активного звонка.'); return; }
  const ok = await showConfirm('Завершить звонок?');
  if (!ok) return;
  hangup(true);
  setStatus('Звонок завершён.');
});

document.getElementById('acceptBtn').addEventListener('click', () => {
  acceptCall().catch(e => setStatus(e.message || 'Ошибка принятия звонка.', true));
});
document.getElementById('declineBtn').addEventListener('click', declineCall);

window.addEventListener('beforeunload', () => hangup(true));

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  const profile = await window.electronAPI.getProfile();
  supabaseConfig = await window.electronAPI.getConfig();
  selfId = profile.id;
  selfIdEl.textContent = selfId;
  await connectSupabase(supabaseConfig.supabaseUrl, supabaseConfig.supabaseKey);
})();