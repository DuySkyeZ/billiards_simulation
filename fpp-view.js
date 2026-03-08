/**
 * FPP View - Realistic 3D First Person Perspective for Billiards Simulator
 * Full table, numbered balls, cue stick, shot paths — Three.js
 */
class FPPView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // Constants
        this.S = 0.01; // scale: 1px = 0.01 3D units
        this.BR = 0.10; // ball radius
        this.PR = 0.22; // pocket radius
        this.TW = 8.30; // table width (X) - long side for horizontal table
        this.TD = 4.30; // table depth (Z) - short side for horizontal table
        this.CX = 450;  // 2D center X (900/2)
        this.CY = 250;  // 2D center Y (500/2)

        this.state = {
            spin: { x: 0, y: 0 },
            power: 5,
            cueBall: null,
            targetBalls: [],
            shot: null,
            aimDirection: null,
        };

        this.objects = {};
        this._targetCamPos = new THREE.Vector3(0, 3, 0);
        this._targetLookAt = new THREE.Vector3(0, 0, 0);
        this._currentLookAt = new THREE.Vector3(0, 0, 0);
        this._animating = false;
        this._lastUpdate = 0;

        // Pool ball definitions
        this.BALL_DEFS = [
            { n: 1,  c: '#F7DC11', s: false },
            { n: 2,  c: '#1E3A8A', s: false },
            { n: 3,  c: '#DC2626', s: false },
            { n: 4,  c: '#6B21A8', s: false },
            { n: 5,  c: '#EA580C', s: false },
            { n: 6,  c: '#047857', s: false },
            { n: 7,  c: '#7C2D12', s: false },
            { n: 8,  c: '#111111', s: false },
            { n: 9,  c: '#F7DC11', s: true },
            { n: 10, c: '#1E3A8A', s: true },
            { n: 11, c: '#DC2626', s: true },
            { n: 12, c: '#6B21A8', s: true },
            { n: 13, c: '#EA580C', s: true },
            { n: 14, c: '#047857', s: true },
            { n: 15, c: '#7C2D12', s: true },
        ];

        try {
            this._init();
        } catch (e) {
            console.error('FPP init error:', e);
            this.container.innerHTML = '<div style="color:#888;font-size:12px;padding:20px;text-align:center;">3D view requires WebGL</div>';
        }
    }

    _toWorld(p) {
        return new THREE.Vector3(
            (p.x - this.CX) * this.S,
            this.BR,
            -(p.y - this.CY) * this.S
        );
    }

    _init() {
        const w = this.container.clientWidth || 300;
        const h = this.container.clientHeight || 170;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x0d0d1a);
        this.container.appendChild(this.renderer.domElement);

        this.camera = new THREE.PerspectiveCamera(55, w / h, 0.05, 50);
        this.camera.position.set(0, 5, -5);
        this.camera.lookAt(0, 0, 0);

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x0d0d1a, 18, 30);

        this._addLighting();
        this._buildTable();
        this._buildCueBall();
        this._buildTargetBalls();
        this._buildCueStick();
        this._buildShotPathGroup();

        this._resizeObserver = new ResizeObserver(() => this._resize());
        this._resizeObserver.observe(this.container);

        this._setupZoom();
        this._startAnimation();
    }

    _setupZoom() {
        this._zoomFactor = 1.0;
        const MIN_ZOOM = 0.4;
        const MAX_ZOOM = 2.5;
        const el = this.renderer.domElement;

        // Mouse wheel zoom
        el.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1.1 : 0.9;
            this._zoomFactor = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this._zoomFactor * delta));
            this._applyZoom();
            this._lastUpdate = Date.now();
            this._startAnimation();
        }, { passive: false });

        // Touch pinch zoom
        let lastPinchDist = 0;
        el.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastPinchDist = Math.sqrt(dx * dx + dy * dy);
            }
        }, { passive: true });

        el.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (lastPinchDist > 0) {
                    const scale = lastPinchDist / dist;
                    this._zoomFactor = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this._zoomFactor * scale));
                    this._applyZoom();
                    this._lastUpdate = Date.now();
                    this._startAnimation();
                }
                lastPinchDist = dist;
            }
        }, { passive: false });

        el.addEventListener('touchend', () => { lastPinchDist = 0; }, { passive: true });
    }

    _applyZoom() {
        this.camera.fov = 55 * this._zoomFactor;
        this.camera.updateProjectionMatrix();
    }

    _addLighting() {
        this.scene.add(new THREE.AmbientLight(0x404050, 0.5));

        const overhead = new THREE.PointLight(0xFFF5E0, 1.2, 20);
        overhead.position.set(0, 5, 0);
        this.scene.add(overhead);

        const oh2 = new THREE.PointLight(0xFFF5E0, 0.5, 15);
        oh2.position.set(-2.5, 4, 0);
        this.scene.add(oh2);

        const oh3 = new THREE.PointLight(0xFFF5E0, 0.5, 15);
        oh3.position.set(2.5, 4, 0);
        this.scene.add(oh3);

        this.scene.add(new THREE.HemisphereLight(0x606080, 0x1a1a2e, 0.3));
    }

    _buildTable() {
        const TW = this.TW, TD = this.TD;
        const RW = 0.35, RH = 0.20, CH = 0.08, CD = 0.06;

        // Floor under table (dark)
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(16, 12),
            new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.9 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.3;
        this.scene.add(floor);

        // Felt
        const felt = new THREE.Mesh(
            new THREE.PlaneGeometry(TW, TD),
            new THREE.MeshStandardMaterial({ color: 0x2E8B3E, roughness: 0.85 })
        );
        felt.rotation.x = -Math.PI / 2;
        felt.position.y = 0;
        this.scene.add(felt);

        // Rails (4 wooden bars around table)
        const railMat = new THREE.MeshStandardMaterial({ color: 0x5D3A1A, roughness: 0.55, metalness: 0.05 });

        // Top rail (positive Z)
        const topRail = new THREE.Mesh(new THREE.BoxGeometry(TW + RW * 2, RH, RW), railMat);
        topRail.position.set(0, RH / 2 - 0.02, TD / 2 + RW / 2);
        this.scene.add(topRail);

        // Bottom rail
        const botRail = topRail.clone();
        botRail.position.set(0, RH / 2 - 0.02, -TD / 2 - RW / 2);
        this.scene.add(botRail);

        // Left rail
        const leftRail = new THREE.Mesh(new THREE.BoxGeometry(RW, RH, TD + RW * 2), railMat);
        leftRail.position.set(-TW / 2 - RW / 2, RH / 2 - 0.02, 0);
        this.scene.add(leftRail);

        // Right rail
        const rightRail = leftRail.clone();
        rightRail.position.set(TW / 2 + RW / 2, RH / 2 - 0.02, 0);
        this.scene.add(rightRail);

        // Cushions (green bumpers along inner edges)
        const cushMat = new THREE.MeshStandardMaterial({ color: 0x2D5A28, roughness: 0.7 });
        const pGap = this.PR * 1.5; // gap around pockets

        // Horizontal table: long sides = top/bottom (X-axis), short sides = left/right (Z-axis)
        // Top/bottom cushions split at center pocket
        const halfLen = TW / 2 - pGap * 2;

        // Top-left cushion
        this._addCushion(cushMat, halfLen, CH, CD,
            -TW / 4, CH / 2, -TD / 2 + CD / 2);
        // Top-right cushion
        this._addCushion(cushMat, halfLen, CH, CD,
            TW / 4, CH / 2, -TD / 2 + CD / 2);
        // Bottom-left
        this._addCushion(cushMat, halfLen, CH, CD,
            -TW / 4, CH / 2, TD / 2 - CD / 2);
        // Bottom-right
        this._addCushion(cushMat, halfLen, CH, CD,
            TW / 4, CH / 2, TD / 2 - CD / 2);
        // Left (short side, no center pocket)
        this._addCushion(cushMat, CD, CH, TD - pGap * 2,
            -TW / 2 + CD / 2, CH / 2, 0);
        // Right (short side, no center pocket)
        this._addCushion(cushMat, CD, CH, TD - pGap * 2,
            TW / 2 - CD / 2, CH / 2, 0);

        // Pockets
        this._buildPockets();

        // Diamonds
        this._buildDiamonds();
    }

    _addCushion(mat, w, h, d, x, y, z) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        this.scene.add(m);
    }

    _buildPockets() {
        // 2D pocket positions → 3D
        // Horizontal table: Lỗ 1(TL), 2(BL), 3(TC), 4(TR), 5(BR), 6(BC)
        const pockets2D = [
            { x: 35, y: 35 },    { x: 35, y: 465 },   { x: 450, y: 32 },
            { x: 865, y: 35 },   { x: 865, y: 465 },  { x: 450, y: 468 },
        ];
        const pocketMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });

        pockets2D.forEach(p => {
            const pos = this._toWorld(p);
            const circle = new THREE.Mesh(
                new THREE.CircleGeometry(this.PR, 32),
                pocketMat
            );
            circle.rotation.x = -Math.PI / 2;
            circle.position.set(pos.x, -0.005, pos.z);
            this.scene.add(circle);

            // Pocket depth cylinder
            const cyl = new THREE.Mesh(
                new THREE.CylinderGeometry(this.PR, this.PR * 0.75, 0.15, 32, 1, true),
                new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.BackSide })
            );
            cyl.position.set(pos.x, -0.08, pos.z);
            this.scene.add(cyl);
        });

        this._pockets3D = pockets2D.map(p => this._toWorld(p));
    }

    _buildDiamonds() {
        const TW = this.TW, TD = this.TD, RW = 0.35;
        const dMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.5 });
        const dGeo = new THREE.CircleGeometry(0.025, 4);

        // Long rails = top & bottom (along X-axis, 7 diamonds each, skip #4)
        for (let i = 1; i <= 7; i++) {
            if (i === 4) continue;
            const x = -TW / 2 + (TW / 8) * i;
            // Top rail (negative Z)
            const d1 = new THREE.Mesh(dGeo, dMat);
            d1.rotation.x = -Math.PI / 2;
            d1.rotation.z = Math.PI / 4;
            d1.position.set(x, 0.19, -TD / 2 - RW / 2);
            this.scene.add(d1);
            // Bottom rail (positive Z)
            const d2 = d1.clone();
            d2.position.set(x, 0.19, TD / 2 + RW / 2);
            this.scene.add(d2);
        }
        // Short rails = left & right (along Z-axis, 3 diamonds each)
        for (let i = 1; i <= 3; i++) {
            const z = -TD / 2 + (TD / 4) * i;
            const d1 = new THREE.Mesh(dGeo, dMat);
            d1.rotation.x = -Math.PI / 2;
            d1.rotation.z = Math.PI / 4;
            d1.position.set(-TW / 2 - RW / 2, 0.19, z);
            this.scene.add(d1);
            const d2 = d1.clone();
            d2.position.set(TW / 2 + RW / 2, 0.19, z);
            this.scene.add(d2);
        }
    }

    _buildCueBall() {
        const geo = new THREE.SphereGeometry(this.BR, 48, 48);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.08, metalness: 0.02,
        });
        const ball = new THREE.Mesh(geo, mat);
        ball.visible = false;
        this.scene.add(ball);
        this.objects.cueBall = ball;

        // Contact point group (child of scene, positioned manually)
        const cpGroup = new THREE.Group();
        const dotGeo = new THREE.CircleGeometry(0.013, 32);
        const dotMat = new THREE.MeshBasicMaterial({
            color: 0xe74c3c, transparent: true, opacity: 0.9,
            side: THREE.DoubleSide, depthTest: false,
        });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.renderOrder = 1;
        cpGroup.add(dot);
        this.objects.contactDot = dot;

        const ringGeo = new THREE.RingGeometry(0.018, 0.022, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xe74c3c, transparent: true, opacity: 0.5,
            side: THREE.DoubleSide, depthTest: false,
        });
        cpGroup.add(new THREE.Mesh(ringGeo, ringMat));

        // Crosshair lines
        const lMat = new THREE.LineBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.4 });
        const hGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-0.03, 0, 0.001), new THREE.Vector3(0.03, 0, 0.001)
        ]);
        cpGroup.add(new THREE.Line(hGeo, lMat));
        const vGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, -0.03, 0.001), new THREE.Vector3(0, 0.03, 0.001)
        ]);
        cpGroup.add(new THREE.Line(vGeo, lMat));

        cpGroup.visible = false;
        this.scene.add(cpGroup);
        this.objects.contactGroup = cpGroup;
    }

    _createBallTexture(def) {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 128;
        const ctx = c.getContext('2d');

        if (def.s) {
            // Stripe: white base + colored band
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, 256, 128);
            ctx.fillStyle = def.c;
            ctx.fillRect(0, 35, 256, 58);
        } else {
            // Solid
            ctx.fillStyle = def.c;
            ctx.fillRect(0, 0, 256, 128);
        }

        // Number circle - front
        this._drawNumberCircle(ctx, 128, 64, def.n);
        // Number circle - back
        this._drawNumberCircle(ctx, 0, 64, def.n);
        // Draw at far right edge (wraps to back)
        this._drawNumberCircle(ctx, 256, 64, def.n);

        const tex = new THREE.CanvasTexture(c);
        return tex;
    }

    _drawNumberCircle(ctx, cx, cy, num) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx, cy, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(num), cx, cy + 1);
    }

    _createDynamicBallTexture(color, number) {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 128;
        const ctx = c.getContext('2d');

        // Solid color ball matching the 2D table representation
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 256, 128);

        // Number circle - front, back, and wrap
        this._drawNumberCircle(ctx, 128, 64, number);
        this._drawNumberCircle(ctx, 0, 64, number);
        this._drawNumberCircle(ctx, 256, 64, number);

        const tex = new THREE.CanvasTexture(c);
        return tex;
    }

    _buildTargetBalls() {
        const geo = new THREE.SphereGeometry(this.BR, 48, 48);
        this.ballMeshes = [];
        this._ballGeo = geo;
        this._ballKeys = []; // track color+number to know when to rebuild

        for (let i = 0; i < 15; i++) {
            const mat = new THREE.MeshStandardMaterial({
                roughness: 0.08, metalness: 0.02,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            this.scene.add(mesh);
            this.ballMeshes.push(mesh);
        }
    }

    _buildCueStick() {
        const group = new THREE.Group();

        // Shaft (main body) — tapered cylinder, ~1.5 units long
        const shaftGeo = new THREE.CylinderGeometry(0.018, 0.012, 1.5, 12);
        const shaftMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.45 });
        const shaft = new THREE.Mesh(shaftGeo, shaftMat);
        shaft.position.y = 0.75; // center of shaft
        group.add(shaft);

        // Ferrule (white ring near tip)
        const fGeo = new THREE.CylinderGeometry(0.012, 0.011, 0.04, 12);
        const fMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.3 });
        const ferrule = new THREE.Mesh(fGeo, fMat);
        ferrule.position.y = -0.02;
        group.add(ferrule);

        // Tip (blue chalk)
        const tGeo = new THREE.SphereGeometry(0.012, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const tMat = new THREE.MeshStandardMaterial({ color: 0x4488cc, roughness: 0.8 });
        const tip = new THREE.Mesh(tGeo, tMat);
        tip.rotation.x = Math.PI;
        tip.position.y = -0.04;
        group.add(tip);

        // Wrap (grip area)
        const wGeo = new THREE.CylinderGeometry(0.019, 0.019, 0.2, 12);
        const wMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
        const wrap = new THREE.Mesh(wGeo, wMat);
        wrap.position.y = 1.2;
        group.add(wrap);

        // Butt (end piece)
        const bGeo = new THREE.CylinderGeometry(0.022, 0.02, 0.15, 12);
        const bMat = new THREE.MeshStandardMaterial({ color: 0x3d2010, roughness: 0.6 });
        const butt = new THREE.Mesh(bGeo, bMat);
        butt.position.y = 1.42;
        group.add(butt);

        group.visible = false;
        this.scene.add(group);
        this.objects.cueStick = group;
    }

    _buildShotPathGroup() {
        this.objects.pathGroup = new THREE.Group();
        this.scene.add(this.objects.pathGroup);

        // Ghost ball
        const ghostMat = new THREE.MeshStandardMaterial({
            color: 0xf1c40f, transparent: true, opacity: 0.35, roughness: 0.3,
        });
        const ghost = new THREE.Mesh(new THREE.SphereGeometry(this.BR, 32, 32), ghostMat);
        ghost.visible = false;
        this.scene.add(ghost);
        this.objects.ghostBall = ghost;

        // Pocket highlight ring
        const ringGeo = new THREE.RingGeometry(this.PR, this.PR + 0.04, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x2ecc71, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.visible = false;
        this.scene.add(ring);
        this.objects.pocketHighlight = ring;
    }

    // =========== UPDATE ===========

    update(newState) {
        Object.assign(this.state, newState);
        this._updateBalls();
        this._updateContactPoint();
        this._updateCueStick();
        this._updateCamera();
        this._updateShotPaths();
        this._lastUpdate = Date.now();
        this._startAnimation();
    }

    _updateBalls() {
        // Cue ball
        const cb = this.state.cueBall;
        if (cb) {
            const pos = this._toWorld(cb);
            this.objects.cueBall.position.copy(pos);
            this.objects.cueBall.visible = true;
        } else {
            this.objects.cueBall.visible = false;
        }

        // Target balls - sync color/number from 2D table
        const tbs = this.state.targetBalls;
        for (let i = 0; i < 15; i++) {
            if (i < tbs.length) {
                const ball = tbs[i];
                const pos = this._toWorld(ball);
                this.ballMeshes[i].position.copy(pos);
                this.ballMeshes[i].visible = true;

                // Rebuild texture if color or number changed
                const key = (ball.color || '#ccc') + '_' + (ball.number || i + 1);
                if (this._ballKeys[i] !== key) {
                    this._ballKeys[i] = key;
                    // Dispose old texture
                    if (this.ballMeshes[i].material.map) {
                        this.ballMeshes[i].material.map.dispose();
                    }
                    const tex = this._createDynamicBallTexture(
                        ball.color || '#ccc',
                        ball.number || i + 1
                    );
                    this.ballMeshes[i].material.map = tex;
                    this.ballMeshes[i].material.needsUpdate = true;
                }
            } else {
                this.ballMeshes[i].visible = false;
                this._ballKeys[i] = null;
            }
        }
    }

    _updateContactPoint() {
        const cb = this.state.cueBall;
        if (!cb) {
            this.objects.contactGroup.visible = false;
            return;
        }

        const { x, y } = this.state.spin;
        const maxAngle = Math.PI * 0.39;
        const mag = Math.sqrt(x * x + y * y);
        const clamped = Math.min(mag, 1.0);
        const nx = mag > 0 ? (x / mag) * clamped : 0;
        const ny = mag > 0 ? (y / mag) * clamped : 0;

        const cx = nx * Math.sin(maxAngle);
        const cy = -ny * Math.sin(maxAngle);
        const cz = Math.sqrt(Math.max(0.01, 1 - cx * cx - cy * cy));

        // Position in world space relative to cue ball
        const ballPos = this.objects.cueBall.position;
        const offset = new THREE.Vector3(cx, cy, cz).multiplyScalar(this.BR * 1.01);
        this.objects.contactGroup.position.copy(ballPos).add(offset);

        // Orient outward
        const normal = offset.clone().normalize();
        const target = this.objects.contactGroup.position.clone().add(normal);
        this.objects.contactGroup.lookAt(target);
        this.objects.contactGroup.visible = true;
    }

    _updateCueStick() {
        const cb = this.state.cueBall;
        if (!cb) {
            this.objects.cueStick.visible = false;
            return;
        }

        const ballPos = this.objects.cueBall.position;
        const powerGap = 0.03 + (this.state.power / 10) * 0.1;

        // Determine aim direction: along shot path if available, else default forward (+Z)
        let aimDir;
        if (this.state.shot && this.state.aimDirection !== null) {
            // Aim toward ghost ball (same direction as the cue path line)
            const angle = this.state.aimDirection;
            const dx = Math.cos(angle) * this.S * 100;
            const dz = -Math.sin(angle) * this.S * 100;
            aimDir = new THREE.Vector3(dx, 0, dz).normalize();
        } else {
            // Default: point toward +Z (camera facing direction)
            aimDir = new THREE.Vector3(0, 0, 1);
        }

        // Cue stick comes from behind the ball (opposite of aim direction)
        // and points toward the aim direction
        const backDir = aimDir.clone().negate(); // direction from ball toward the player

        // Add slight elevation based on spin
        const spinMag = Math.sqrt(this.state.spin.x * this.state.spin.x + this.state.spin.y * this.state.spin.y);
        backDir.y += spinMag * 0.04;
        backDir.normalize();

        // Tip position: just behind the ball surface along the back direction
        const tipPos = ballPos.clone().add(backDir.clone().multiplyScalar(this.BR + powerGap));

        // Group origin at center of cue (shaft center at y=0.75 in local)
        const cueGroup = this.objects.cueStick;
        cueGroup.position.copy(tipPos).add(backDir.clone().multiplyScalar(0.75));

        // Point the stick tip toward the ball (lookAt the ball center)
        const lookTarget = cueGroup.position.clone().add(backDir);
        cueGroup.lookAt(lookTarget);
        cueGroup.rotateX(Math.PI / 2);
        cueGroup.visible = true;
    }

    _updateCamera() {
        const cb = this.state.cueBall;

        if (!cb) {
            // Default: overview from south side of horizontal table
            this._targetCamPos.set(0, 5, 5);
            this._targetLookAt.set(0, 0, 0);
            return;
        }

        const cbPos = this._toWorld(cb);

        if (this.state.shot && this.state.aimDirection !== null) {
            // Shot mode: camera behind cue ball along shot line
            const angle = this.state.aimDirection;
            const aimX = Math.cos(angle) * this.S * 100;
            const aimZ = -Math.sin(angle) * this.S * 100;
            const aimDir = new THREE.Vector3(aimX, 0, aimZ).normalize();

            // Position camera behind cue ball along shot direction
            const camBack = aimDir.clone().multiplyScalar(-2.0);
            camBack.y = 1.0;
            this._targetCamPos.copy(cbPos).add(camBack);

            // Look straight at ghost ball for precise aiming
            const ghostPos = this._toWorld(this.state.shot.ghostBall);
            this._targetLookAt.copy(ghostPos);
            this._targetLookAt.y = this.BR;
        } else {
            // No shot: behind cue ball from south side, looking toward table
            this._targetCamPos.set(cbPos.x * 0.5, 3.0, cbPos.z + 3.5);
            this._targetLookAt.set(0, 0, cbPos.z - 3.0);
        }

        // Clamp camera bounds
        this._targetCamPos.x = Math.max(-6, Math.min(6, this._targetCamPos.x));
        this._targetCamPos.z = Math.max(-4, Math.min(7, this._targetCamPos.z));
        this._targetCamPos.y = Math.max(0.4, this._targetCamPos.y);
    }

    _updateShotPaths() {
        // Clear previous paths
        const pg = this.objects.pathGroup;
        while (pg.children.length) {
            const child = pg.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            pg.remove(child);
        }

        const shot = this.state.shot;
        this.objects.ghostBall.visible = false;
        this.objects.pocketHighlight.visible = false;

        if (!shot) return;

        const pathColors = {
            'cue': 0x2ECC71,
            'target': 0x2ECC71,
            'cue-kick': 0x9B59B6,
            'cue-kick-reflect': 0x9B59B6,
            'target-bank': 0x3498DB,
            'target-bank-reflect': 0x3498DB,
        };

        // Draw path segments
        if (shot.path) {
            shot.path.forEach(seg => {
                const from = this._toWorld(seg.from);
                const to = this._toWorld(seg.to);
                from.y = this.BR; to.y = this.BR;

                const color = pathColors[seg.type] || 0xffffff;
                const isDashed = seg.type.includes('reflect') || seg.type.includes('kick');

                const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
                let mat;
                if (isDashed) {
                    mat = new THREE.LineDashedMaterial({ color, dashSize: 0.1, gapSize: 0.05, transparent: true, opacity: 0.7 });
                } else {
                    mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 });
                }
                const line = new THREE.Line(geo, mat);
                if (isDashed) line.computeLineDistances();
                pg.add(line);
            });
        }

        // Ghost ball
        if (shot.ghostBall) {
            const gPos = this._toWorld(shot.ghostBall);
            this.objects.ghostBall.position.copy(gPos);
            this.objects.ghostBall.visible = true;
        }

        // Bounce points
        if (shot.bouncePoints && shot.bouncePoints.length > 0) {
            const bpMat = new THREE.MeshBasicMaterial({ color: 0xFF8C00 });
            const bpGeo = new THREE.SphereGeometry(0.03, 12, 12);
            shot.bouncePoints.forEach(bp => {
                const pos = this._toWorld(bp);
                pos.y = this.BR;
                const mesh = new THREE.Mesh(bpGeo, bpMat);
                mesh.position.copy(pos);
                pg.add(mesh);
            });
        }

        // Pocket highlight
        if (shot.pocket) {
            const pPos = this._toWorld(shot.pocket);
            this.objects.pocketHighlight.position.set(pPos.x, 0.002, pPos.z);
            this.objects.pocketHighlight.visible = true;
        }

        // Cue after position
        if (shot.cueAfter) {
            const caPos = this._toWorld(shot.cueAfter);
            const caMat = new THREE.MeshStandardMaterial({
                color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.3,
            });
            const caMesh = new THREE.Mesh(new THREE.SphereGeometry(this.BR * 0.8, 16, 16), caMat);
            caMesh.position.copy(caPos);
            pg.add(caMesh);
        }
    }

    // =========== ANIMATION ===========

    _startAnimation() {
        if (this._animating) return;
        this._animating = true;
        this._animate();
    }

    _animate() {
        if (!this._animating) return;

        // Smooth camera transitions
        const lf = 0.07;
        this.camera.position.lerp(this._targetCamPos, lf);
        this._currentLookAt.lerp(this._targetLookAt, lf);
        this.camera.lookAt(this._currentLookAt);

        // Pulse contact point
        if (this.objects.contactDot) {
            this.objects.contactDot.material.opacity = 0.8 + 0.2 * Math.sin(Date.now() * 0.005);
        }

        this.renderer.render(this.scene, this.camera);

        if (Date.now() - this._lastUpdate > 4000) {
            this._animating = false;
            if (this.objects.contactDot) this.objects.contactDot.material.opacity = 0.9;
            this.renderer.render(this.scene, this.camera);
            return;
        }

        requestAnimationFrame(() => this._animate());
    }

    _resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w === 0 || h === 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this._lastUpdate = Date.now();
        this._startAnimation();
    }

    dispose() {
        this._animating = false;
        if (this._resizeObserver) this._resizeObserver.disconnect();
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
        }
    }
}
