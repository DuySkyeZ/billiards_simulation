/**
 * Billiards Pool Simulator - Main Application
 * Supports multiple target balls with per-ball shot analysis
 */

(function () {
    const canvas = document.getElementById('poolTable');
    const ctx = canvas.getContext('2d');
    const { TABLE, PLAY, POCKETS } = PoolEngine;

    // Ball colors for up to 15 target balls
    const BALL_COLORS = [
        '#e74c3c', '#3498db', '#9b59b6', '#e67e22', '#1abc9c',
        '#f1c40f', '#2ecc71', '#e91e63', '#00bcd4', '#ff5722',
        '#8bc34a', '#673ab7', '#ff9800', '#009688', '#795548',
    ];

    // ========== STATE ==========
    const state = {
        placementMode: 'cue', // 'cue' | 'target'
        cueBall: null,
        targetBalls: [],       // array of { x, y, color, id }
        nextBallId: 1,
        results: [],           // per-ball analysis results
        selectedBallIdx: null, // which target ball's results to show
        activeShot: null,      // which shot is highlighted
        dragging: null,        // { type: 'cue' } | { type: 'target', idx: number } | null
        spin: { x: 0, y: 0 },
        power: 5,
        analyzed: false,
    };

    const MAX_BALLS = 15;

    // ========== DRAWING ==========

    function drawTable() {
        ctx.fillStyle = '#5D3A1A';
        ctx.fillRect(0, 0, TABLE.width, TABLE.height);

        const railInset = 8;
        ctx.fillStyle = '#2D5A28';
        ctx.fillRect(railInset, railInset, TABLE.width - railInset * 2, TABLE.height - railInset * 2);

        ctx.fillStyle = '#2E8B3E';
        ctx.fillRect(PLAY.left, PLAY.top, PLAY.width, PLAY.height);

        // Felt texture
        ctx.strokeStyle = 'rgba(0,0,0,0.03)';
        ctx.lineWidth = 1;
        for (let y = PLAY.top; y < PLAY.bottom; y += 6) {
            ctx.beginPath();
            ctx.moveTo(PLAY.left, y);
            ctx.lineTo(PLAY.right, y);
            ctx.stroke();
        }

        // Head string
        const headStringX = PLAY.left + PLAY.width * 0.25;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(headStringX, PLAY.top);
        ctx.lineTo(headStringX, PLAY.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Spots
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        [0.5, 0.75].forEach(frac => {
            ctx.beginPath();
            ctx.arc(PLAY.left + PLAY.width * frac, PLAY.top + PLAY.height * 0.5, 3, 0, Math.PI * 2);
            ctx.fill();
        });

        drawDiamonds();

        // Pockets
        for (const pocket of POCKETS) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.arc(pocket.x + 2, pocket.y + 2, TABLE.pocketRadius, 0, Math.PI * 2);
            ctx.fill();

            const gradient = ctx.createRadialGradient(pocket.x, pocket.y, 0, pocket.x, pocket.y, TABLE.pocketRadius);
            gradient.addColorStop(0, '#111');
            gradient.addColorStop(0.7, '#1a1a1a');
            gradient.addColorStop(1, '#333');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(pocket.x, pocket.y, TABLE.pocketRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = '#1E4D1A';
        ctx.lineWidth = 2;
        ctx.strokeRect(PLAY.left, PLAY.top, PLAY.width, PLAY.height);
    }

    function drawDiamonds() {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        const size = 4;
        const midY1 = (8 + PLAY.top) / 2;
        const midY2 = (PLAY.bottom + TABLE.height - 8) / 2;
        const midX1 = (8 + PLAY.left) / 2;
        const midX2 = (PLAY.right + TABLE.width - 8) / 2;

        for (let i = 1; i <= 7; i++) {
            if (i === 4) continue;
            const x = PLAY.left + (PLAY.width / 8) * i;
            diamond(x, midY1, size);
            diamond(x, midY2, size);
        }
        for (let i = 1; i <= 3; i++) {
            const y = PLAY.top + (PLAY.height / 4) * i;
            diamond(midX1, y, size);
            diamond(midX2, y, size);
        }
    }

    function diamond(x, y, s) {
        ctx.beginPath();
        ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y);
        ctx.closePath(); ctx.fill();
    }

    function drawBall(x, y, radius, color, label, isGhost) {
        if (isGhost) {
            ctx.globalAlpha = 0.4;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            return;
        }

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(x + 2, y + 2, radius, 0, Math.PI * 2);
        ctx.fill();

        // Ball
        const isWhite = color === '#fff' || color === '#ffffff';
        const gradient = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, radius);
        if (isWhite) {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.8, '#e0e0e0');
            gradient.addColorStop(1, '#cccccc');
        } else {
            gradient.addColorStop(0, lighten(color, 40));
            gradient.addColorStop(0.6, color);
            gradient.addColorStop(1, darken(color, 30));
        }
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(x - 3, y - 3, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Label
        if (label) {
            ctx.fillStyle = isWhite ? '#333' : '#fff';
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x, y);
        }
    }

    function lighten(hex, n) {
        const c = parseInt(hex.slice(1), 16);
        return `rgb(${Math.min(255, (c >> 16) + n)},${Math.min(255, ((c >> 8) & 0xFF) + n)},${Math.min(255, (c & 0xFF) + n)})`;
    }
    function darken(hex, n) {
        const c = parseInt(hex.slice(1), 16);
        return `rgb(${Math.max(0, (c >> 16) - n)},${Math.max(0, ((c >> 8) & 0xFF) - n)},${Math.max(0, (c & 0xFF) - n)})`;
    }

    function drawShotPaths() {
        if (!state.analyzed || state.selectedBallIdx === null) return;

        const result = state.results.find(r => r.ballIndex === state.selectedBallIdx);
        if (!result || result.shots.length === 0) return;

        result.shots.forEach((shot, idx) => {
            const isActive = idx === state.activeShot;
            if (!isActive && state.activeShot !== null) return;
            const alpha = isActive ? 0.85 : 0.3;

            const colors = {
                'cue': `rgba(46, 204, 113, ${alpha})`,
                'target': `rgba(46, 204, 113, ${alpha})`,
                'cue-kick': `rgba(155, 89, 182, ${alpha})`,
                'cue-kick-reflect': `rgba(155, 89, 182, ${alpha})`,
                'target-bank': `rgba(52, 152, 219, ${alpha})`,
                'target-bank-reflect': `rgba(52, 152, 219, ${alpha})`,
            };

            shot.path.forEach(seg => {
                ctx.strokeStyle = colors[seg.type] || `rgba(255,255,255,${alpha})`;
                ctx.lineWidth = isActive ? 3 : 1.5;
                ctx.setLineDash(seg.type.includes('reflect') || seg.type.includes('kick') ? [8, 6] : []);
                ctx.beginPath();
                ctx.moveTo(seg.from.x, seg.from.y);
                ctx.lineTo(seg.to.x, seg.to.y);
                ctx.stroke();

                if (isActive) drawArrow(seg.from, seg.to, ctx.strokeStyle);
            });
            ctx.setLineDash([]);

            if (isActive && shot.ghostBall) {
                drawBall(shot.ghostBall.x, shot.ghostBall.y, TABLE.ballRadius, '#f1c40f', '', true);
                ctx.fillStyle = 'rgba(241, 196, 15, 0.7)';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Ghost', shot.ghostBall.x, shot.ghostBall.y - 16);
            }

            if (isActive && (shot.bouncePoints || shot.bouncePoint)) {
                const bps = shot.bouncePoints || [shot.bouncePoint];
                bps.forEach((bp, bpi) => {
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.8)';
                    ctx.beginPath();
                    ctx.arc(bp.x, bp.y, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.8)';
                    ctx.font = '10px Arial'; ctx.textAlign = 'center';
                    const label = bps.length > 1 ? `B${bpi + 1}` : 'Bounce';
                    ctx.fillText(label, bp.x, bp.y - 10);
                });
            }

            if (isActive && shot.cueAfter) {
                ctx.globalAlpha = 0.5;
                drawBall(shot.cueAfter.x, shot.cueAfter.y, TABLE.ballRadius - 2, '#ffffff', '', true);
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(shot.ghostBall.x, shot.ghostBall.y);
                ctx.lineTo(shot.cueAfter.x, shot.cueAfter.y);
                ctx.stroke(); ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.font = '9px Arial'; ctx.textAlign = 'center';
                ctx.fillText('Bi cái (dự đoán)', shot.cueAfter.x, shot.cueAfter.y + 18);
                ctx.globalAlpha = 1;
            }

            if (isActive) {
                ctx.strokeStyle = 'rgba(46, 204, 113, 0.8)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(shot.pocket.x, shot.pocket.y, TABLE.pocketRadius + 4, 0, Math.PI * 2);
                ctx.stroke();
            }
        });

        // Draw angle arc for active shot
        if (state.activeShot !== null) {
            const shot = result.shots[state.activeShot];
            if (shot && shot.ghostBall && shot.cutAngleDeg > 5) {
                const gb = shot.ghostBall;
                const tb = state.targetBalls[state.selectedBallIdx];
                if (tb) {
                    const a1 = PoolEngine.angleBetween(gb, state.cueBall);
                    const a2 = PoolEngine.angleBetween(tb, shot.pocket);
                    ctx.strokeStyle = 'rgba(241, 196, 15, 0.6)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(gb.x, gb.y, 25, Math.min(a1, a2), Math.max(a1, a2));
                    ctx.stroke();
                    const mid = (a1 + a2) / 2;
                    ctx.fillStyle = 'rgba(241, 196, 15, 0.8)';
                    ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
                    ctx.fillText(`${shot.cutAngleDeg.toFixed(1)}°`, gb.x + Math.cos(mid) * 38, gb.y + Math.sin(mid) * 38);
                }
            }
        }
    }

    function drawArrow(from, to, color) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const len = 10;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - len * Math.cos(angle - Math.PI / 6), to.y - len * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(to.x - len * Math.cos(angle + Math.PI / 6), to.y - len * Math.sin(angle + Math.PI / 6));
        ctx.closePath(); ctx.fill();
    }

    function render() {
        ctx.clearRect(0, 0, TABLE.width, TABLE.height);
        drawTable();
        drawShotPaths();

        // Draw all target balls
        state.targetBalls.forEach((ball, idx) => {
            const isSelected = state.analyzed && idx === state.selectedBallIdx;
            const r = TABLE.ballRadius;
            drawBall(ball.x, ball.y, r, ball.color, String(idx + 1));

            // Selection ring
            if (isSelected) {
                ctx.strokeStyle = '#f1c40f';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(ball.x, ball.y, r + 4, 0, Math.PI * 2);
                ctx.stroke();
            }
        });

        // Draw cue ball
        if (state.cueBall) {
            drawBall(state.cueBall.x, state.cueBall.y, TABLE.ballRadius, '#ffffff', '');
        }

        // Placement hint
        if (!state.cueBall || state.targetBalls.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            if (!state.cueBall) {
                ctx.fillText('Click để đặt bi cái (trắng)', TABLE.width / 2, TABLE.height / 2 - 10);
            } else if (state.targetBalls.length === 0) {
                ctx.fillText('Click để đặt bi mục tiêu', TABLE.width / 2, TABLE.height / 2 - 10);
            }
        }

        requestAnimationFrame(render);
    }

    // ========== INTERACTION ==========

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }

    function isInPlayArea(pos) {
        return pos.x >= PLAY.left + TABLE.ballRadius && pos.x <= PLAY.right - TABLE.ballRadius &&
            pos.y >= PLAY.top + TABLE.ballRadius && pos.y <= PLAY.bottom - TABLE.ballRadius;
    }

    function isTooCloseToAny(pos, exclude) {
        if (state.cueBall && exclude !== 'cue' && PoolEngine.dist(pos, state.cueBall) < TABLE.ballRadius * 2.5) return true;
        for (let i = 0; i < state.targetBalls.length; i++) {
            if (exclude === i) continue;
            if (PoolEngine.dist(pos, state.targetBalls[i]) < TABLE.ballRadius * 2.5) return true;
        }
        return false;
    }

    canvas.addEventListener('mousedown', (e) => {
        const pos = getMousePos(e);

        // Check drag on existing balls
        if (state.cueBall && PoolEngine.dist(pos, state.cueBall) < TABLE.ballRadius + 5) {
            state.dragging = { type: 'cue' };
            canvas.style.cursor = 'grabbing';
            return;
        }
        for (let i = 0; i < state.targetBalls.length; i++) {
            if (PoolEngine.dist(pos, state.targetBalls[i]) < TABLE.ballRadius + 5) {
                state.dragging = { type: 'target', idx: i };
                canvas.style.cursor = 'grabbing';
                return;
            }
        }

        if (!isInPlayArea(pos)) return;

        if (state.placementMode === 'cue') {
            if (isTooCloseToAny(pos, 'cue')) return;
            state.cueBall = { x: pos.x, y: pos.y };
            clearAnalysis();
            if (state.targetBalls.length === 0) setPlacementMode('target');
        } else {
            // Add new target ball
            if (state.targetBalls.length >= MAX_BALLS) return;
            if (isTooCloseToAny(pos, -1)) return;
            const color = BALL_COLORS[state.targetBalls.length % BALL_COLORS.length];
            state.targetBalls.push({ x: pos.x, y: pos.y, color, id: state.nextBallId++ });
            clearAnalysis();
        }

        updateUI();
        updateFPP();
    });

    canvas.addEventListener('mousemove', (e) => {
        const pos = getMousePos(e);

        if (state.dragging) {
            if (!isInPlayArea(pos)) return;
            const exclude = state.dragging.type === 'cue' ? 'cue' : state.dragging.idx;
            if (isTooCloseToAny(pos, exclude)) return;

            if (state.dragging.type === 'cue') {
                state.cueBall = { x: pos.x, y: pos.y };
            } else {
                state.targetBalls[state.dragging.idx].x = pos.x;
                state.targetBalls[state.dragging.idx].y = pos.y;
            }
            if (state.analyzed) runAnalysis();
            updateFPP();
            return;
        }

        // Cursor hints
        let hover = false;
        if (state.cueBall && PoolEngine.dist(pos, state.cueBall) < TABLE.ballRadius + 5) hover = true;
        for (const b of state.targetBalls) {
            if (PoolEngine.dist(pos, b) < TABLE.ballRadius + 5) hover = true;
        }
        canvas.style.cursor = hover ? 'grab' : isInPlayArea(pos) ? 'crosshair' : 'default';
    });

    canvas.addEventListener('mouseup', () => { state.dragging = null; canvas.style.cursor = 'crosshair'; });
    canvas.addEventListener('mouseleave', () => { state.dragging = null; });

    // Right-click to remove target ball
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const pos = getMousePos(e);
        for (let i = state.targetBalls.length - 1; i >= 0; i--) {
            if (PoolEngine.dist(pos, state.targetBalls[i]) < TABLE.ballRadius + 5) {
                state.targetBalls.splice(i, 1);
                // Reassign colors
                state.targetBalls.forEach((b, idx) => { b.color = BALL_COLORS[idx % BALL_COLORS.length]; });
                clearAnalysis();
                updateUI();
                updateFPP();
                return;
            }
        }
    });

    // ========== UI CONTROLS ==========

    function setPlacementMode(mode) {
        state.placementMode = mode;
        document.querySelectorAll('.btn-place').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.ball === mode);
        });
    }

    document.getElementById('btn-place-cue').addEventListener('click', () => setPlacementMode('cue'));
    document.getElementById('btn-place-target').addEventListener('click', () => setPlacementMode('target'));
    document.getElementById('btn-analyze').addEventListener('click', () => runAnalysis());

    document.getElementById('btn-reset').addEventListener('click', () => {
        state.cueBall = null;
        state.targetBalls = [];
        state.nextBallId = 1;
        state.results = [];
        state.selectedBallIdx = null;
        state.activeShot = null;
        state.analyzed = false;
        state.spin = { x: 0, y: 0 };
        state.power = 5;
        setPlacementMode('cue');
        document.getElementById('powerSlider').value = 5;
        document.getElementById('powerValue').textContent = '5';
        const sp = document.getElementById('spinPoint');
        sp.style.left = '50%'; sp.style.top = '50%';
        updateSpinDisplay();
        updateUI();
        updateFPP();
    });

    function clearAnalysis() {
        state.analyzed = false;
        state.results = [];
        state.selectedBallIdx = null;
        state.activeShot = null;
    }

    function updateUI() {
        // Analyze button
        document.getElementById('btn-analyze').disabled = !(state.cueBall && state.targetBalls.length > 0);

        // Ball chips
        updateBallChips();

        // Shot results
        updateShotResults();
    }

    function updateBallChips() {
        const container = document.getElementById('ball-chips');
        if (state.targetBalls.length === 0) {
            container.innerHTML = '';
            return;
        }

        let html = '<span class="chip-label">Bi trên bàn:</span> ';
        state.targetBalls.forEach((ball, idx) => {
            const isSelected = state.analyzed && idx === state.selectedBallIdx;
            const shotCount = state.analyzed ? (state.results.find(r => r.ballIndex === idx)?.shots.length || 0) : '';
            html += `<span class="ball-chip ${isSelected ? 'selected' : ''}" data-idx="${idx}" style="--ball-color: ${ball.color}">
                <span class="chip-dot" style="background: ${ball.color}"></span>
                Bi ${idx + 1}${shotCount !== '' ? ` (${shotCount})` : ''}
                <button class="chip-remove" data-idx="${idx}" title="Xóa bi">&times;</button>
            </span>`;
        });
        container.innerHTML = html;

        // Click handlers
        container.querySelectorAll('.ball-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                if (e.target.classList.contains('chip-remove')) return;
                const idx = parseInt(chip.dataset.idx);
                if (state.analyzed) {
                    state.selectedBallIdx = idx;
                    state.activeShot = 0;
                    updateUI();
                }
            });
        });
        container.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                state.targetBalls.splice(idx, 1);
                state.targetBalls.forEach((b, i) => { b.color = BALL_COLORS[i % BALL_COLORS.length]; });
                clearAnalysis();
                updateUI();
            });
        });
    }

    // Power slider
    document.getElementById('powerSlider').addEventListener('input', (e) => {
        state.power = parseInt(e.target.value);
        document.getElementById('powerValue').textContent = state.power;
        if (state.analyzed) runAnalysis();
        updateFPP();
    });

    // Spin selector
    const spinSelector = document.getElementById('spinSelector');
    let spinDragging = false;

    function updateSpinFromEvent(e) {
        const rect = spinSelector.getBoundingClientRect();
        const cx = rect.width / 2, cy = rect.height / 2, r = rect.width / 2 - 8;
        let rx = e.clientX - rect.left - cx, ry = e.clientY - rect.top - cy;
        const d = Math.sqrt(rx * rx + ry * ry);
        if (d > r) { rx = (rx / d) * r; ry = (ry / d) * r; }
        state.spin.x = rx / r;
        state.spin.y = ry / r;
        const sp = document.getElementById('spinPoint');
        sp.style.left = (50 + (rx / r) * 42) + '%';
        sp.style.top = (50 + (ry / r) * 42) + '%';
        updateSpinDisplay();
        if (state.analyzed) runAnalysis();
        updateFPP();
    }

    spinSelector.addEventListener('mousedown', (e) => { spinDragging = true; updateSpinFromEvent(e); });
    document.addEventListener('mousemove', (e) => { if (spinDragging) updateSpinFromEvent(e); });
    document.addEventListener('mouseup', () => { spinDragging = false; });
    spinSelector.addEventListener('dblclick', () => {
        state.spin = { x: 0, y: 0 };
        const sp = document.getElementById('spinPoint');
        sp.style.left = '50%'; sp.style.top = '50%';
        updateSpinDisplay();
        if (state.analyzed) runAnalysis();
        updateFPP();
    });

    function updateSpinDisplay() {
        const v = state.spin.y, h = state.spin.x;
        document.getElementById('spinVertical').textContent =
            v < -0.3 ? `${(v * -100).toFixed(0)}% Follow (đẩy)` :
                v > 0.3 ? `${(v * 100).toFixed(0)}% Draw (kéo)` : 'Trung tâm (stop/stun)';
        document.getElementById('spinHorizontal').textContent =
            h < -0.3 ? `${(h * -100).toFixed(0)}% English trái` :
                h > 0.3 ? `${(h * 100).toFixed(0)}% English phải` : 'Trung tâm';
    }

    // ========== ANALYSIS ==========

    function runAnalysis() {
        if (!state.cueBall || state.targetBalls.length === 0) return;

        const engineSpin = { x: state.spin.x, y: -state.spin.y };
        state.results = PoolEngine.analyzeMultiBall(state.cueBall, state.targetBalls, engineSpin, state.power);
        state.analyzed = true;

        // Select the ball with easiest shot, or keep current selection
        if (state.selectedBallIdx === null || !state.results.find(r => r.ballIndex === state.selectedBallIdx)) {
            state.selectedBallIdx = state.results.length > 0 ? state.results[0].ballIndex : null;
        }
        state.activeShot = 0;
        syncSpinPowerToShot();
        updateUI();
        updateFPP();
    }

    function updateShotResults() {
        const placeholder = document.getElementById('shot-placeholder');
        const results = document.getElementById('shot-results');

        if (!state.analyzed || state.results.length === 0) {
            placeholder.style.display = 'block';
            results.style.display = 'none';
            if (state.analyzed && state.results.every(r => r.shots.length === 0)) {
                placeholder.innerHTML = '<p>Không tìm thấy thế đánh khả thi. Hãy thử di chuyển bi.</p>';
            } else if (!state.analyzed) {
                placeholder.innerHTML = '<p>Đặt bi cái và bi mục tiêu lên bàn, sau đó nhấn <strong>"Phân Tích Thế Đánh"</strong>. Click phải để xóa bi.</p>';
            }
            return;
        }

        placeholder.style.display = 'none';
        results.style.display = 'flex';

        // Summary
        const totalShots = state.results.reduce((s, r) => s + r.shots.length, 0);
        let html = `<div class="results-summary">
            Tổng ${totalShots} thế đánh cho ${state.targetBalls.length} bi |
            ${PoolEngine.describeSpinEffect({ x: state.spin.x, y: -state.spin.y })}
        </div>`;

        // Ball tabs
        html += '<div class="ball-tabs">';
        state.results.forEach(r => {
            const ball = state.targetBalls[r.ballIndex];
            if (!ball) return;
            const isActive = r.ballIndex === state.selectedBallIdx;
            const bestDiff = r.shots.length > 0 ? r.shots[0].difficulty : '-';
            html += `<button class="ball-tab ${isActive ? 'active' : ''}" data-idx="${r.ballIndex}" style="border-color: ${ball.color}">
                <span class="tab-dot" style="background: ${ball.color}"></span>
                Bi ${r.ballIndex + 1}
                <span class="tab-count">${r.shots.length} thế</span>
            </button>`;
        });
        html += '</div>';

        // Shots for selected ball
        const selectedResult = state.results.find(r => r.ballIndex === state.selectedBallIdx);
        if (selectedResult) {
            if (selectedResult.shots.length === 0) {
                html += '<div class="no-shots">Không có thế đánh trực tiếp khả thi cho bi này.</div>';
            } else {
                selectedResult.shots.forEach((shot, idx) => {
                    const isActive = idx === state.activeShot;
                    const risksHtml = shot.risks && shot.risks.length > 0
                        ? `<div class="shot-risks"><b>Rủi ro:</b> ${shot.risks.join('; ')}</div>` : '';
                    const posHtml = shot.positionAdvice
                        ? `<div class="shot-position"><b>Position:</b> ${shot.positionAdvice}</div>` : '';

                    html += `
                    <div class="shot-card ${shot.type} ${isActive ? 'active' : ''}" data-idx="${idx}">
                        <div class="shot-card-header">
                            <span class="shot-card-title">${getTypeIcon(shot.type)} ${shot.typeName}</span>
                            <span class="shot-difficulty">${shot.difficultyText}</span>
                        </div>
                        <div class="shot-card-detail">
                            <div class="detail-row">
                                <span class="detail-label">Lỗ:</span>
                                <span class="detail-value"><span class="pocket-name">${shot.pocket.name}</span></span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Góc cắt:</span>
                                <span class="detail-value">${shot.cutAngleDeg.toFixed(1)}°</span>
                            </div>
                            ${shot.hitSide ? `<div class="detail-row">
                                <span class="detail-label">Phía đánh:</span>
                                <span class="detail-value">Bên ${shot.hitSide}</span>
                            </div>` : ''}
                            ${shot.spinRec ? `<div class="detail-row">
                                <span class="detail-label">Tip cơ:</span>
                                <span class="detail-value">${shot.spinRec.tipPosition}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Lực:</span>
                                <span class="detail-value">${shot.spinRec.power}</span>
                            </div>` : ''}
                            ${shot.cueAfter ? `<div class="detail-row">
                                <span class="detail-label">Bi cái sau:</span>
                                <span class="detail-value">${shot.cueAfter.type === 'stop' ? 'Dừng tại chỗ' : shot.cueAfter.type === 'draw' ? 'Kéo lại' : shot.cueAfter.type === 'follow' ? 'Đẩy về trước' : 'Lệch tự nhiên'}</span>
                            </div>` : ''}
                        </div>
                        <div class="shot-advice">${(shot.advice || '').replace(/\n/g, '<br>')}</div>
                        ${risksHtml}
                        ${posHtml}
                    </div>`;
                });
            }

            // Blocked paths section
            if (selectedResult.blockedPaths && selectedResult.blockedPaths.length > 0) {
                html += '<div class="blocked-section"><h3>Đường bị chặn</h3>';
                selectedResult.blockedPaths.forEach(bp => {
                    html += `<div class="blocked-item">
                        <div class="blocked-pocket">Lỗ ${bp.pocket.name} (${bp.angleDeg.toFixed(1)}°)</div>
                        <div class="blocked-reasons">${bp.reasons.map(r => `<span class="blocked-reason">${r}</span>`).join('')}</div>
                        <div class="blocked-suggestions">${bp.suggestion.map(s => `<span class="suggest-item">${s}</span>`).join('')}</div>
                    </div>`;
                });
                html += '</div>';
            }
        }

        results.innerHTML = html;

        // Event handlers
        results.querySelectorAll('.ball-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                state.selectedBallIdx = parseInt(tab.dataset.idx);
                state.activeShot = 0;
                syncSpinPowerToShot();
                updateUI();
                updateFPP();
            });
        });
        results.querySelectorAll('.shot-card').forEach(card => {
            card.addEventListener('click', () => {
                state.activeShot = parseInt(card.dataset.idx);
                syncSpinPowerToShot();
                updateUI();
                updateFPP();
            });
        });
    }

    function syncSpinPowerToShot() {
        if (state.selectedBallIdx === null || state.activeShot === null) return;
        const result = state.results.find(r => r.ballIndex === state.selectedBallIdx);
        if (!result) return;
        const shot = result.shots[state.activeShot];
        if (!shot || !shot.spinRec) return;

        // Parse recommended power from spinRec.power text
        const powerMatch = shot.spinRec.power.match(/(\d+)-?(\d+)?%/);
        if (powerMatch) {
            const pLow = parseInt(powerMatch[1]);
            const pHigh = powerMatch[2] ? parseInt(powerMatch[2]) : pLow;
            const pMid = Math.round((pLow + pHigh) / 2);
            state.power = Math.max(1, Math.min(10, Math.round(pMid / 10)));
            document.getElementById('powerSlider').value = state.power;
            document.getElementById('powerValue').textContent = state.power;
        }

        // Parse recommended spin from spinRec.tipPosition text
        const tip = shot.spinRec.tipPosition.toLowerCase();
        let spinX = 0, spinY = 0;

        // Clock system: 12h=top(follow), 6h=bottom(draw), 3h=right, 9h=left
        if (tip.includes('tâm') || tip.includes('center')) {
            spinX = 0; spinY = 0;
        } else {
            // Parse clock hours
            const hourMatch = tip.match(/(\d+)h/);
            if (hourMatch) {
                const h = parseInt(hourMatch[1]);
                // Convert clock to spin: 12h→y=-1(follow), 6h→y=1(draw), 3h→x=1, 9h→x=-1
                const angle = ((h - 12) * 30) * Math.PI / 180; // degrees from 12 o'clock
                spinX = Math.sin(angle) * 0.6;
                spinY = -Math.cos(angle) * 0.6; // negative cos because y-axis inverted for follow/draw
            }
            // Adjust intensity based on keywords
            if (tip.includes('nhẹ')) {
                spinX *= 0.5; spinY *= 0.5;
            } else if (tip.includes('mạnh')) {
                spinX *= 1.3; spinY *= 1.3;
            }
        }

        // Handle range like "4-5h" - take average
        const rangeMatch = tip.match(/(\d+)-(\d+)h/);
        if (rangeMatch) {
            const h1 = parseInt(rangeMatch[1]);
            const h2 = parseInt(rangeMatch[2]);
            const hAvg = (h1 + h2) / 2;
            const angle = ((hAvg - 12) * 30) * Math.PI / 180;
            spinX = Math.sin(angle) * 0.6;
            spinY = -Math.cos(angle) * 0.6;
            if (tip.includes('nhẹ')) { spinX *= 0.5; spinY *= 0.5; }
        }

        // Clamp
        spinX = Math.max(-1, Math.min(1, spinX));
        spinY = Math.max(-1, Math.min(1, spinY));

        state.spin.x = spinX;
        state.spin.y = spinY;

        // Update spin widget visual
        const sp = document.getElementById('spinPoint');
        sp.style.left = (50 + spinX * 42) + '%';
        sp.style.top = (50 + spinY * 42) + '%';
        updateSpinDisplay();
    }

    function getTypeIcon(type) {
        return { straight: '🎯', cut: '📐', bank: '💎', kick: '🦵' }[type] || '🎱';
    }

    // ========== FPP 3D VIEW ==========
    const fppView = new FPPView('fpp-container');

    function updateFPP() {
        if (!fppView) return;
        const update = {
            spin: { ...state.spin },
            power: state.power,
            cueBall: state.cueBall ? { ...state.cueBall } : null,
            targetBalls: state.targetBalls.map(b => ({ x: b.x, y: b.y, color: b.color })),
            shot: null,
            aimDirection: null,
        };

        if (state.analyzed && state.selectedBallIdx !== null && state.activeShot !== null) {
            const result = state.results.find(r => r.ballIndex === state.selectedBallIdx);
            if (result && result.shots[state.activeShot]) {
                const shot = result.shots[state.activeShot];
                update.aimDirection = PoolEngine.angleBetween(state.cueBall, shot.ghostBall);
                update.shot = {
                    ghostBall: shot.ghostBall,
                    path: shot.path,
                    bouncePoints: shot.bouncePoints || (shot.bouncePoint ? [shot.bouncePoint] : []),
                    pocket: shot.pocket,
                    type: shot.type,
                    cueAfter: shot.cueAfter || null,
                };
            }
        }

        fppView.update(update);
    }

    // ========== FPP FULLSCREEN ==========
    document.getElementById('btn-fpp-fullscreen').addEventListener('click', () => {
        const section = document.getElementById('fpp-view-section');
        if (!document.fullscreenElement) {
            (section.requestFullscreen || section.webkitRequestFullscreen).call(section);
        } else {
            (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        }
    });

    // ========== INIT ==========
    updateUI();
    render();
})();
