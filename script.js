(function () {
  'use strict';

  const CAPACITY_LITERS = 2500;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
  const HISTORY_SIZE = 20;
  const LOW_LEVEL_THRESHOLD = 20;
  const HIGH_LEVEL_THRESHOLD = 85;

  let currentLevel = 65;
  let targetLevel = 65;
  let autoDemo = false;
  let fillActive = false;
  let drainActive = false;
  let autoDirection = 1;
  let levelHistory = [];
  let alarmState = null;
  let alarmInterval = null;
  let audioContext = null;

  const els = {
    waterFill: document.getElementById('waterFill'),
    levelPercent: document.getElementById('levelPercent'),
    levelRing: document.getElementById('levelRing'),
    summaryVolume: document.getElementById('summaryVolume'),
    tankBadge: document.getElementById('tankBadge'),
    metricLevel: document.getElementById('metricLevel'),
    metricVolume: document.getElementById('metricVolume'),
    metricFlow: document.getElementById('metricFlow'),
    metricTemp: document.getElementById('metricTemp'),
    metricPressure: document.getElementById('metricPressure'),
    levelSlider: document.getElementById('levelSlider'),
    sliderValue: document.getElementById('sliderValue'),
    btnFill: document.getElementById('btnFill'),
    btnDrain: document.getElementById('btnDrain'),
    btnAuto: document.getElementById('btnAuto'),
    alertMessage: document.getElementById('alertMessage'),
    lastUpdated: document.getElementById('lastUpdated'),
    logBody: document.getElementById('logBody'),
    levelChart: document.getElementById('levelChart'),
    alarmSound: document.getElementById('alarmSound'),
    statusDot: document.getElementById('statusDot'),
    systemStatus: document.getElementById('systemStatus'),
    zoneLow: document.querySelector('.zone-low'),
    zoneNormal: document.querySelector('.zone-normal'),
    zoneHigh: document.querySelector('.zone-high'),
  };

  function getStatus(level) {
    if (level < LOW_LEVEL_THRESHOLD) {
      return {
        badge: 'Low Level',
        cls: 'danger',
        log: 'Low',
        alarm: 'low',
        msg: '⚠ LOW WATER LEVEL! Level below ' + LOW_LEVEL_THRESHOLD + '%. Refill immediately.',
      };
    }
    if (level > HIGH_LEVEL_THRESHOLD) {
      return {
        badge: 'Overflow',
        cls: 'warning',
        log: 'High',
        alarm: 'overflow',
        msg: '🚨 OVERFLOW ALERT! Level above ' + HIGH_LEVEL_THRESHOLD + '%. Tank is almost full.',
      };
    }
    return {
      badge: 'Normal',
      cls: '',
      log: 'Normal',
      alarm: null,
      msg: 'All systems nominal. Water level within safe range.',
    };
  }

  function ensureAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  function playBeep(frequency, duration) {
    const ctx = ensureAudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  }

  function startAlarm(type) {
    if (alarmState === type) return;

    stopAlarm();
    alarmState = type;

    const frequency = type === 'low' ? 440 : 880;
    const intervalMs = type === 'low' ? 1200 : 600;

    playBeep(frequency, 0.2);
    alarmInterval = setInterval(function () {
      playBeep(frequency, 0.2);
    }, intervalMs);

    if (els.alarmSound) {
      els.alarmSound.loop = true;
      els.alarmSound.play().catch(function () {});
    }
  }

  function stopAlarm() {
    alarmState = null;

    if (alarmInterval) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }

    if (els.alarmSound) {
      els.alarmSound.pause();
      els.alarmSound.currentTime = 0;
    }
  }

  function updateAlarmState(level, status) {
    if (status.alarm === 'low') {
      startAlarm('low');
    } else if (status.alarm === 'overflow') {
      startAlarm('overflow');
    } else {
      stopAlarm();
    }

    document.body.classList.toggle('alarm-active', !!status.alarm);
    document.body.classList.toggle('alarm-low', status.alarm === 'low');
    document.body.classList.toggle('alarm-overflow', status.alarm === 'overflow');

    if (els.statusDot) {
      els.statusDot.className = 'status-dot' + (status.alarm ? ' alarm' : '');
    }

    if (els.systemStatus) {
      if (status.alarm === 'low') {
        els.systemStatus.textContent = 'Alarm: Low Water Level';
        els.systemStatus.style.color = 'var(--danger)';
      } else if (status.alarm === 'overflow') {
        els.systemStatus.textContent = 'Alarm: Overflow Risk';
        els.systemStatus.style.color = 'var(--warning)';
      } else {
        els.systemStatus.textContent = 'System Online';
        els.systemStatus.style.color = 'var(--success)';
      }
    }

    if (els.zoneLow) els.zoneLow.classList.toggle('zone-active', status.alarm === 'low');
    if (els.zoneNormal) els.zoneNormal.classList.toggle('zone-active', !status.alarm);
    if (els.zoneHigh) els.zoneHigh.classList.toggle('zone-active', status.alarm === 'overflow');
  }

  function setWaterVisual(level) {
    els.waterFill.style.height = level + '%';
    els.waterFill.classList.remove('low', 'high');
    if (level < LOW_LEVEL_THRESHOLD) els.waterFill.classList.add('low');
    else if (level > HIGH_LEVEL_THRESHOLD) els.waterFill.classList.add('high');
  }

  function updateUI(level) {
    const rounded = level.toFixed(1);
    const volume = Math.round((level / 100) * CAPACITY_LITERS);
    const status = getStatus(level);

    els.levelPercent.textContent = Math.round(level);
    els.levelRing.style.strokeDashoffset = RING_CIRCUMFERENCE - (level / 100) * RING_CIRCUMFERENCE;
    els.summaryVolume.textContent = volume.toLocaleString() + ' L';
    els.metricLevel.textContent = rounded + '%';
    els.metricVolume.textContent = volume.toLocaleString() + ' L';
    els.sliderValue.textContent = Math.round(level) + '%';
    els.levelSlider.value = level;

    els.tankBadge.textContent = status.badge;
    els.tankBadge.className = 'badge' + (status.cls ? ' ' + status.cls : '');
    els.alertMessage.textContent = status.msg;
    els.alertMessage.className = 'alert-message' + (status.cls ? ' ' + status.cls : '');

    const ringColor = level < LOW_LEVEL_THRESHOLD ? '#ef4444' : level > HIGH_LEVEL_THRESHOLD ? '#f59e0b' : '#38bdf8';
    els.levelRing.style.stroke = ringColor;

    els.lastUpdated.textContent = new Date().toLocaleTimeString();
    setWaterVisual(level);
    updateAlarmState(level, status);
  }

  function updateFlowDisplay() {
    let flow = 0;
    if (fillActive) flow = 12.4 + Math.random() * 2;
    else if (drainActive) flow = -(8.6 + Math.random() * 2);
    else if (autoDemo) flow = autoDirection * (5 + Math.random() * 3);
    else flow = (Math.random() - 0.5) * 0.4;

    const sign = flow >= 0 ? '+' : '';
    els.metricFlow.textContent = sign + flow.toFixed(1) + ' L/min';
    els.metricFlow.style.color = flow > 1 ? '#22c55e' : flow < -1 ? '#ef4444' : '#38bdf8';
  }

  function updateSensors() {
    els.metricTemp.textContent = (23.5 + Math.random() * 1.5).toFixed(1) + ' °C';
    const pressure = 0.8 + (currentLevel / 100) * 0.4 + (Math.random() - 0.5) * 0.02;
    els.metricPressure.textContent = pressure.toFixed(2) + ' bar';
  }

  function addLogEntry(level) {
    const status = getStatus(level);
    const time = new Date().toLocaleTimeString();
    const row = document.createElement('tr');
    row.innerHTML =
      '<td>' + time + '</td>' +
      '<td>' + level.toFixed(1) + '%</td>' +
      '<td class="log-status-' + (status.cls || 'normal') + '">' + status.log + '</td>';

    els.logBody.insertBefore(row, els.logBody.firstChild);

    while (els.logBody.children.length > 10) {
      els.logBody.removeChild(els.logBody.lastChild);
    }
  }

  function pushHistory(level) {
    levelHistory.push(level);
    if (levelHistory.length > HISTORY_SIZE) {
      levelHistory.shift();
    }
    drawChart();
  }

  function drawChart() {
    const canvas = els.levelChart;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 16, right: 16, bottom: 24, left: 36 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach(function (val) {
      const y = pad.top + chartH - (val / 100) * chartH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px Rajdhani, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val + '%', pad.left - 6, y + 3);
    });

    if (levelHistory.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    levelHistory.forEach(function (val, i) {
      const x = pad.left + (i / (HISTORY_SIZE - 1)) * chartW;
      const y = pad.top + chartH - (val / 100) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const last = levelHistory[levelHistory.length - 1];
    const lastX = pad.left + ((levelHistory.length - 1) / (HISTORY_SIZE - 1)) * chartW;
    const lastY = pad.top + chartH - (last / 100) * chartH;

    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
  }

  function tick() {
    const diff = targetLevel - currentLevel;
    if (Math.abs(diff) > 0.05) {
      currentLevel += diff * 0.06;
    } else {
      currentLevel = targetLevel;
    }

    updateUI(currentLevel);
  }

  let lastLogTime = 0;

  function mainLoop() {
    requestAnimationFrame(mainLoop);
    tick();

    const now = Date.now();
    if (now - lastLogTime > 3000) {
      pushHistory(currentLevel);
      addLogEntry(currentLevel);
      lastLogTime = now;
    }
  }

  document.addEventListener('click', ensureAudioContext, { passive: true });
  document.addEventListener('keydown', ensureAudioContext, { passive: true });

  els.levelSlider.addEventListener('input', function () {
    ensureAudioContext();
    targetLevel = parseFloat(this.value);
    fillActive = false;
    drainActive = false;
    autoDemo = false;
    els.btnFill.classList.remove('active');
    els.btnDrain.classList.remove('active');
    els.btnAuto.classList.remove('active');
  });

  els.btnFill.addEventListener('click', function () {
    fillActive = !fillActive;
    drainActive = false;
    autoDemo = false;
    els.btnDrain.classList.remove('active');
    els.btnAuto.classList.remove('active');
    this.classList.toggle('active', fillActive);
    if (fillActive) targetLevel = 100;
  });

  els.btnDrain.addEventListener('click', function () {
    drainActive = !drainActive;
    fillActive = false;
    autoDemo = false;
    els.btnFill.classList.remove('active');
    els.btnAuto.classList.remove('active');
    this.classList.toggle('active', drainActive);
    if (drainActive) targetLevel = 0;
  });

  els.btnAuto.addEventListener('click', function () {
    autoDemo = !autoDemo;
    fillActive = false;
    drainActive = false;
    els.btnFill.classList.remove('active');
    els.btnDrain.classList.remove('active');
    this.classList.toggle('active', autoDemo);
  });

  setInterval(function () {
    if (autoDemo) {
      targetLevel += autoDirection * 0.3;
      if (targetLevel >= 95) autoDirection = -1;
      if (targetLevel <= 10) autoDirection = 1;
    }
    if (fillActive && currentLevel >= 99.5) {
      fillActive = false;
      els.btnFill.classList.remove('active');
    }
    if (drainActive && currentLevel <= 0.5) {
      drainActive = false;
      els.btnDrain.classList.remove('active');
    }
    updateFlowDisplay();
  }, 200);

  setInterval(updateSensors, 3000);
  window.addEventListener('resize', drawChart);

  updateUI(currentLevel);
  updateFlowDisplay();
  pushHistory(currentLevel);
  addLogEntry(currentLevel);
  drawChart();
  mainLoop();
})();