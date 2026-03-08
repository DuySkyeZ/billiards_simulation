/**
 * Pool Engine - Tính toán các thế đánh billiards nâng cao
 * Ghost ball method, reflection angles, diamond system
 * Blocked path analysis, spin recommendations, position play
 */

const PoolEngine = (() => {
    const TABLE = {
        width: 900, height: 500, cushion: 35,
        pocketRadius: 22, ballRadius: 10,
    };

    const PLAY = {
        left: TABLE.cushion, top: TABLE.cushion,
        right: TABLE.width - TABLE.cushion, bottom: TABLE.height - TABLE.cushion,
        width: TABLE.width - 2 * TABLE.cushion, height: TABLE.height - 2 * TABLE.cushion,
    };

    const POCKETS = [
        { id: 0, name: 'Trên-Trái',  x: PLAY.left,                     y: PLAY.top,      corner: true  },
        { id: 1, name: 'Trên-Giữa',  x: (PLAY.left + PLAY.right) / 2,  y: PLAY.top - 3,  corner: false },
        { id: 2, name: 'Trên-Phải',  x: PLAY.right,                    y: PLAY.top,      corner: true  },
        { id: 3, name: 'Dưới-Trái',  x: PLAY.left,                     y: PLAY.bottom,   corner: true  },
        { id: 4, name: 'Dưới-Giữa',  x: (PLAY.left + PLAY.right) / 2,  y: PLAY.bottom+3, corner: false },
        { id: 5, name: 'Dưới-Phải',  x: PLAY.right,                    y: PLAY.bottom,   corner: true  },
    ];

    const WALLS = [
        { name: 'Thành trên',  axis: 'y', value: PLAY.top,    reflect: 'y' },
        { name: 'Thành dưới',  axis: 'y', value: PLAY.bottom, reflect: 'y' },
        { name: 'Thành trái',  axis: 'x', value: PLAY.left,   reflect: 'x' },
        { name: 'Thành phải',  axis: 'x', value: PLAY.right,  reflect: 'x' },
    ];

    // ========== MATH HELPERS ==========
    function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
    function angle(from, to) { return Math.atan2(to.y - from.y, to.x - from.x); }
    function deg(rad) { return rad * 180 / Math.PI; }
    function norm(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

    function ghostBallPos(obj, target) {
        const a = angle(target, obj);
        return { x: obj.x + Math.cos(a) * TABLE.ballRadius * 2, y: obj.y + Math.sin(a) * TABLE.ballRadius * 2 };
    }

    // ========== PATH CHECKING WITH BLOCKER IDENTIFICATION ==========
    function checkPath(from, to, obstacles = [], opts = {}) {
        const d = dist(from, to);
        if (d < 1) return { clear: true };
        const steps = Math.max(1, Math.ceil(d / 5));
        const pocketProximity = opts.relaxed ? TABLE.pocketRadius * 4 : TABLE.pocketRadius * 3;
        const obstacleThreshold = opts.relaxed ? TABLE.ballRadius * 2.0 : TABLE.ballRadius * 2.2;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = from.x + (to.x - from.x) * t;
            const y = from.y + (to.y - from.y) * t;
            // wallBounce: skip ALL boundary checks (paths to/from walls are geometrically valid)
            if (!opts.wallBounce) {
                if (x < PLAY.left + TABLE.ballRadius || x > PLAY.right - TABLE.ballRadius ||
                    y < PLAY.top + TABLE.ballRadius || y > PLAY.bottom - TABLE.ballRadius) {
                    let near = false;
                    for (const p of POCKETS) { if (dist({ x, y }, p) < pocketProximity) { near = true; break; } }
                    if (!near) return { clear: false, blocker: null, reason: 'cushion' };
                }
            }
            for (let oi = 0; oi < obstacles.length; oi++) {
                if (dist({ x, y }, obstacles[oi]) < obstacleThreshold) {
                    return { clear: false, blocker: oi, blockerPos: obstacles[oi], reason: 'ball' };
                }
            }
        }
        return { clear: true };
    }

    function isPathClear(from, to, obstacles = []) {
        return checkPath(from, to, obstacles).clear;
    }

    // ========== MULTI-CUSHION HELPERS ==========
    function mirrorPoint(point, wall) {
        if (wall.reflect === 'y') return { x: point.x, y: 2 * wall.value - point.y };
        return { x: 2 * wall.value - point.x, y: point.y };
    }

    function wallIntersect(from, to, wall) {
        let t;
        if (wall.reflect === 'y') {
            if (Math.abs(to.y - from.y) < 0.001) return null;
            t = (wall.value - from.y) / (to.y - from.y);
        } else {
            if (Math.abs(to.x - from.x) < 0.001) return null;
            t = (wall.value - from.x) / (to.x - from.x);
        }
        if (t <= 0.01 || t > 1.5) return null;
        return { x: from.x + t * (to.x - from.x), y: from.y + t * (to.y - from.y) };
    }

    function isValidBounce(bp) {
        if (!bp) return false;
        if (bp.x < PLAY.left - 5 || bp.x > PLAY.right + 5 ||
            bp.y < PLAY.top - 5 || bp.y > PLAY.bottom + 5) return false;
        for (const p of POCKETS) {
            if (dist(bp, p) < TABLE.pocketRadius * 2) return false;
        }
        return true;
    }

    function cutAngle(cue, obj, pocket) {
        const ghost = ghostBallPos(obj, pocket);
        return Math.abs(norm(angle(cue, ghost) - angle(obj, pocket)));
    }

    // ========== DIAMOND SYSTEM ==========
    function getDiamondNumber(pos, wall) {
        if (wall.reflect === 'y') {
            return ((pos.x - PLAY.left) / PLAY.width * 8).toFixed(1);
        } else {
            return ((pos.y - PLAY.top) / PLAY.height * 4).toFixed(1);
        }
    }

    // ========== DIFFICULTY ==========
    function shotDifficulty(cutRad, distance, type) {
        const cutD = Math.abs(deg(cutRad));
        let d = cutD < 5 ? 1 : cutD < 20 ? 2 : cutD < 40 ? 3 : cutD < 60 ? 4 : 5;
        if (distance > 500) d += 2; else if (distance > 300) d += 1;
        if (type === 'bank') d += 1.5;
        if (type === 'kick') d += 2;
        return Math.min(5, Math.max(1, Math.round(d)));
    }

    function stars(n) { return '\u2605'.repeat(n) + '\u2606'.repeat(5 - n); }

    // ========== SPIN RECOMMENDATION ==========
    function recommendSpin(shot, cueBall, targetBall) {
        const cutDeg = shot.cutAngleDeg;
        const cueToTarget = angle(cueBall, targetBall);
        const targetToPocket = angle(targetBall, shot.pocket);
        const cross = Math.sin(targetToPocket - cueToTarget);
        const hitSide = cross > 0 ? 'right' : 'left';

        const rec = { tipPosition: '', spinDesc: '', power: '', bridge: '', cueAngle: '' };

        // Tip position (clock system)
        if (shot.type === 'straight') {
            rec.tipPosition = 'Tâm bi (6h)';
            rec.spinDesc = 'Không spin - stop shot. Hoặc 12h cho follow, 6h thấp cho draw.';
            rec.power = cutDeg < 3 ? 'Nhẹ-Vừa (40-60%)' : 'Vừa (50-70%)';
            rec.bridge = 'Open bridge, cầu tay thấp ổn định';
            rec.cueAngle = 'Cơ nằm ngang song song mặt bàn';
        } else if (shot.type === 'cut') {
            if (cutDeg < 25) {
                rec.tipPosition = hitSide === 'right' ? '5h (nhẹ english trái)' : '7h (nhẹ english phải)';
                rec.spinDesc = `English nhẹ ${hitSide === 'right' ? 'trái' : 'phải'} bù deflection. Giữ gần tâm để chính xác.`;
                rec.power = 'Vừa (50-65%)';
            } else if (cutDeg < 45) {
                rec.tipPosition = hitSide === 'right' ? '4-5h' : '7-8h';
                rec.spinDesc = `English ${hitSide === 'right' ? 'trái' : 'phải'} vừa. Bù throw effect. Cơ đâm xuyên qua bi.`;
                rec.power = 'Vừa-Mạnh (55-75%)';
            } else {
                rec.tipPosition = hitSide === 'right' ? '3-4h' : '8-9h';
                rec.spinDesc = `English ${hitSide === 'right' ? 'trái' : 'phải'} mạnh bù góc cắt lớn. CẨN THẬN: dễ miscue nếu đánh quá xa tâm.`;
                rec.power = 'Mạnh (65-80%) - cơ đâm xuyên dài';
            }
            rec.bridge = cutDeg > 40 ? 'Closed bridge (cầu tay kín) cho ổn định' : 'Open bridge, tay chắc';
            rec.cueAngle = 'Cơ nằm ngang, tránh nhấc đuôi cơ';
        } else if (shot.type === 'bank') {
            rec.tipPosition = 'Tâm bi hoặc nhẹ phía trên (12h nhẹ)';
            rec.spinDesc = 'KHÔNG dùng english cho bank shot cơ bản. English thay đổi góc bật gây sai lệch. Chỉ pro mới dùng running/reverse english.';
            rec.power = 'Vừa (50-60%) - quá mạnh làm lệch góc bật';
            rec.bridge = 'Closed bridge ổn định';
            rec.cueAngle = 'Cơ nằm ngang tuyệt đối';
        } else if (shot.type === 'kick') {
            rec.tipPosition = 'Tâm bi (center)';
            rec.spinDesc = 'Đánh tâm, tránh english. Running english (cùng chiều bật) giúp góc mở hơn nếu cần.';
            rec.power = 'Vừa (50-65%)';
            rec.bridge = 'Closed bridge';
            rec.cueAngle = 'Cơ nằm ngang';
        }

        return rec;
    }

    // ========== POSITION PLAY ADVICE ==========
    function positionAdvice(shot, cueAfter) {
        if (!cueAfter) return '';
        const parts = [];
        // Check if cue ball ends up near a pocket (scratch risk)
        for (const p of POCKETS) {
            if (dist(cueAfter, p) < TABLE.pocketRadius * 3) {
                parts.push(`NGUY HIỂM: Bi cái có thể scratch (lọt lỗ ${p.name}). Điều chỉnh spin/lực để tránh.`);
                break;
            }
        }
        // Check if cue ball near cushion
        if (cueAfter.x < PLAY.left + 30 || cueAfter.x > PLAY.right - 30 ||
            cueAfter.y < PLAY.top + 30 || cueAfter.y > PLAY.bottom - 30) {
            parts.push('Bi cái dừng gần thành - khó cầu tay cho cú tiếp theo.');
        }
        // Spin modification suggestions
        if (cueAfter.type === 'natural') {
            parts.push('Dùng draw (kéo) để kéo bi cái về giữa bàn, hoặc follow để đẩy qua.');
        }
        if (parts.length === 0) parts.push('Vị trí bi cái sau đánh tốt, thuận lợi cho cú tiếp theo.');
        return parts.join(' ');
    }

    // ========== RISK ASSESSMENT ==========
    function assessRisk(shot, cueBall, targetBall, obstacles) {
        const risks = [];
        const distCue = dist(cueBall, shot.ghostBall);

        // Near-pocket shots have lower risk
        if (shot.nearPocket) {
            if (distCue > 400) risks.push('Bi gần lỗ nhưng khoảng cách bi cái xa - cần đánh chính xác');
            return risks; // skip other risk checks for near-pocket shots
        }

        if (distCue > 500) risks.push('Khoảng cách xa - khó kiểm soát chính xác');
        if (shot.cutAngleDeg > 55) risks.push('Góc cắt rất lớn - dễ miss, cần luyện nhiều');
        if (shot.cutAngleDeg > 40 && distCue > 350) risks.push('Góc lớn + khoảng cách xa = rủi ro cao');

        // Check if near obstacles
        for (const obs of obstacles) {
            const dToPath = distPointToLine(obs, cueBall, shot.ghostBall);
            if (dToPath < TABLE.ballRadius * 4 && dToPath > TABLE.ballRadius * 2.2) {
                risks.push('Bi khác nằm gần đường đi - dễ chạm nhầm (foul/kiss)');
                break;
            }
        }

        if (shot.type === 'bank' || shot.type === 'kick') {
            risks.push('Cú đánh gián tiếp - cần tính toán góc chính xác');
        }

        // Scratch risk
        if (shot.cueAfter) {
            for (const p of POCKETS) {
                if (dist(shot.cueAfter, p) < TABLE.pocketRadius * 2.5) {
                    risks.push(`Nguy cơ scratch vào lỗ ${p.name}`);
                    break;
                }
            }
        }

        return risks;
    }

    function distPointToLine(point, lineA, lineB) {
        const dx = lineB.x - lineA.x, dy = lineB.y - lineA.y;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return dist(point, lineA);
        let t = ((point.x - lineA.x) * dx + (point.y - lineA.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return dist(point, { x: lineA.x + t * dx, y: lineA.y + t * dy });
    }

    // ========== BLOCKED PATH ANALYSIS ==========
    function analyzeBlockedPaths(cueBall, targetBall, obstacles) {
        const blocked = [];
        const NEAR_POCKET_THRESHOLD = TABLE.pocketRadius * 2.5;
        for (const pocket of POCKETS) {
            const ghost = ghostBallPos(targetBall, pocket);
            const angleDeg = Math.abs(deg(cutAngle(cueBall, targetBall, pocket)));
            const dPocket = dist(targetBall, pocket);
            const nearPocket = dPocket < NEAR_POCKET_THRESHOLD;
            const maxAngle = nearPocket ? 85 : 80;
            if (angleDeg > maxAngle) continue; // skip impossible angles anyway

            const pathCue = checkPath(cueBall, ghost, obstacles, nearPocket ? { relaxed: true } : {});
            const pathCueAlt = nearPocket ? checkPath(cueBall, targetBall, obstacles, { relaxed: true }) : { clear: false };
            const pathTarget = nearPocket ? { clear: true } : checkPath(targetBall, pocket, obstacles);

            // For near-pocket: if either ghost path or direct path is clear, it's not blocked
            const cueClear = pathCue.clear || pathCueAlt.clear;

            if (!cueClear || !pathTarget.clear) {
                const reasons = [];
                if (!cueClear) {
                    const mainPath = pathCue.clear ? pathCueAlt : pathCue;
                    if (mainPath.reason === 'ball') {
                        reasons.push(`Bi ${mainPath.blocker + 1} chặn đường bi cái đến ghost ball`);
                    } else {
                        reasons.push('Đường bi cái bị thành bàn chặn');
                    }
                }
                if (!pathTarget.clear) {
                    if (pathTarget.reason === 'ball') {
                        reasons.push(`Bi ${pathTarget.blocker + 1} chặn đường bi mục tiêu đến lỗ`);
                    } else {
                        reasons.push('Đường bi mục tiêu đến lỗ bị chặn');
                    }
                }
                blocked.push({
                    pocket, angleDeg, reasons,
                    suggestion: suggestAlternative(cueBall, targetBall, pocket, pathCue, pathTarget, obstacles),
                });
            }
        }
        return blocked;
    }

    function suggestAlternative(cueBall, targetBall, pocket, pathCue, pathTarget, obstacles) {
        const suggestions = [];
        if (!pathCue.clear && pathCue.reason === 'ball') {
            suggestions.push('Thử kick shot (bi cái bật thành vòng qua vật cản)');
            suggestions.push('Hoặc dùng massé curve cơ nâng cao để vòng qua bi chặn');
        }
        if (!pathTarget.clear && pathTarget.reason === 'ball') {
            suggestions.push('Thử bank shot (bi mục tiêu bật thành vào lỗ khác)');
            suggestions.push('Hoặc đánh combination/carom qua bi chặn');
        }
        if (suggestions.length === 0) {
            suggestions.push('Cân nhắc safety play - đặt bi cái ở vị trí khó cho đối thủ');
        }
        return suggestions;
    }

    // ========== ADVANCED ADVICE GENERATION ==========
    function generateAdvice(shot, cueBall, targetBall, obstacles) {
        const spin = recommendSpin(shot, cueBall, targetBall);
        const distCue = dist(cueBall, shot.ghostBall);
        const distPocket = dist(targetBall, shot.pocket);
        const lines = [];

        // Near-pocket notice
        if (shot.nearPocket) {
            lines.push(`<b>★ Bi gần lỗ:</b> Bi mục tiêu cách lỗ ${shot.pocket.name} chỉ ${Math.round(distPocket)}px - cú đánh dễ, chỉ cần chạm nhẹ đúng hướng.`);
        }

        // Main technique description
        if (shot.type === 'straight') {
            lines.push(`<b>Kỹ thuật:</b> Đánh thẳng vào lỗ ${shot.pocket.name}. Bi cái - bi mục tiêu - lỗ gần thẳng hàng (${shot.cutAngleDeg.toFixed(1)}°).`);
            lines.push(`<b>Ngắm:</b> Nhắm thẳng vào tâm bi mục tiêu. Ghost ball trùng gần với bi mục tiêu.`);
            if (shot.nearPocket) {
                lines.push(`<b>Lưu ý:</b> Bi đã ở miệng lỗ - đánh nhẹ tay, tập trung vào chính xác hơn là lực. Dùng cơ hội để kiểm soát position bi cái.`);
            } else if (distCue < 200) {
                lines.push(`<b>Lưu ý:</b> Khoảng cách gần (${Math.round(distCue)}px) - dùng stop shot (đánh tâm) bi cái dừng tại chỗ, lý tưởng cho position.`);
            } else {
                lines.push(`<b>Lưu ý:</b> Khoảng cách ${Math.round(distCue)}px - cần follow through dài để đảm bảo lực đến.`);
            }
        } else if (shot.type === 'cut') {
            const thickness = shot.cutAngleDeg < 15 ? '3/4 bi (dày)' :
                shot.cutAngleDeg < 30 ? '1/2 bi' :
                    shot.cutAngleDeg < 50 ? '1/4 bi (mỏng)' : '1/8 bi (rất mỏng)';
            lines.push(`<b>Kỹ thuật:</b> Cắt ${shot.cutType} góc ${shot.cutAngleDeg.toFixed(1)}° vào lỗ ${shot.pocket.name}. Đánh vào bên <b>${shot.hitSide}</b> bi mục tiêu.`);
            lines.push(`<b>Ngắm:</b> Nhắm vào ghost ball (điểm vàng trên bàn). Tiếp xúc ${thickness}. Tưởng tượng bi cái "hôn" bi mục tiêu ở ${shot.hitSide === 'phải' ? 'mặt phải' : 'mặt trái'}.`);
            if (shot.cutAngleDeg > 45) {
                lines.push(`<b>Nâng cao:</b> Góc cắt > 45° rất khó. Tập trung vào ghost ball, KHÔNG nhìn bi mục tiêu. Cơ đâm xuyên thẳng, tránh ngoáy.`);
                lines.push(`<b>Throw effect:</b> Ở góc cắt lớn, bi mục tiêu bị "throw" lệch ~1-2° do ma sát. Bù bằng cách nhắm hơi mỏng hơn.`);
            }
        } else if (shot.type === 'bank') {
            if (shot.multiCushion >= 2) {
                const wallNames = shot.walls.map(w => w.name).join(' → ');
                const diamonds = shot.bouncePoints.map((bp, i) => `${shot.walls[i].name}: diamond ~${getDiamondNumber(bp, shot.walls[i])}`).join(', ');
                lines.push(`<b>Kỹ thuật:</b> ${shot.multiCushion} băng - bi mục tiêu bật ${wallNames} vào lỗ ${shot.pocket.name}.`);
                lines.push(`<b>Diamond System:</b> ${diamonds}. Tính toán dựa trên phản xạ kép (double mirror).`);
                lines.push(`<b>Ngắm:</b> Nhắm bi mục tiêu đến điểm bật đầu tiên. Góc tới = góc phản xạ tại mỗi thành.`);
                lines.push(`<b>Quan trọng:</b> Đánh tâm bi, lực mạnh hơn 1 băng ~${shot.multiCushion === 2 ? '30-50%' : '50-70%'}. Mỗi lần bật thành mất ~20% lực. KHÔNG dùng english trừ running english nhẹ.`);
            } else {
                const diamondNum = getDiamondNumber(shot.bouncePoint, shot.wall);
                lines.push(`<b>Kỹ thuật:</b> Bank shot - bi mục tiêu bật ${shot.wall.name} vào lỗ ${shot.pocket.name}.`);
                lines.push(`<b>Diamond System:</b> Bi chạm thành tại diamond ~${diamondNum}. Nguyên lý: góc tới = góc phản xạ.`);
                lines.push(`<b>Ngắm:</b> Tưởng tượng "lỗ ảo" phía sau thành (gương phản chiếu). Nhắm bi mục tiêu đi thẳng đến lỗ ảo đó.`);
                lines.push(`<b>Quan trọng:</b> KHÔNG dùng english. Đánh tâm bi cái, lực vừa phải. Quá mạnh → bi bật ngắn (shortens angle), quá nhẹ → bi bật dài.`);
            }
        } else if (shot.type === 'kick') {
            if (shot.multiCushion >= 2) {
                const wallNames = shot.walls.map(w => w.name).join(' → ');
                const diamonds = shot.bouncePoints.map((bp, i) => `${shot.walls[i].name}: diamond ~${getDiamondNumber(bp, shot.walls[i])}`).join(', ');
                lines.push(`<b>Kỹ thuật:</b> ${shot.multiCushion}-kick - bi cái bật ${wallNames} rồi chạm bi mục tiêu, đẩy vào lỗ ${shot.pocket.name}.`);
                lines.push(`<b>Diamond System:</b> ${diamonds}. Dùng hệ thống mirror ${shot.multiCushion} lần.`);
                lines.push(`<b>Lưu ý:</b> Lực mạnh (mất ~${shot.multiCushion * 20}% qua ${shot.multiCushion} thành). Running english (cùng chiều bật) giúp duy trì đường đi. Cú đánh nâng cao - cần luyện tập nhiều.`);
            } else {
                const diamondNum = getDiamondNumber(shot.bouncePoint, shot.wall);
                lines.push(`<b>Kỹ thuật:</b> Kick shot - bi cái bật ${shot.wall.name} rồi chạm bi mục tiêu, đẩy vào lỗ ${shot.pocket.name}.`);
                lines.push(`<b>Diamond System:</b> Nhắm bi cái đến diamond ~${diamondNum} trên ${shot.wall.name}. Dùng hệ thống "mirror" - đếm diamond để tính góc.`);
                lines.push(`<b>Lưu ý:</b> Sau khi bật thành, bi cái mất lực ~30-40%. Đánh mạnh hơn bình thường. Running english (cùng chiều bật) giúp bi giữ đường thẳng hơn.`);
            }
        }

        // Spin recommendation
        lines.push('');
        lines.push(`<b>Vị trí đánh tip:</b> ${spin.tipPosition}`);
        lines.push(`<b>Spin:</b> ${spin.spinDesc}`);
        lines.push(`<b>Lực:</b> ${spin.power}`);
        lines.push(`<b>Cầu tay:</b> ${spin.bridge}`);
        lines.push(`<b>Góc cơ:</b> ${spin.cueAngle}`);

        return lines.join('\n');
    }

    // ========== SHOT FINDING (with obstacles) ==========
    function findAllShots(cueBall, targetBall, obstacles, spin, power) {
        const shots = [];
        const NEAR_POCKET_THRESHOLD = TABLE.pocketRadius * 2.5;

        for (const pocket of POCKETS) {
            const ghost = ghostBallPos(targetBall, pocket);
            const ang = cutAngle(cueBall, targetBall, pocket);
            const angDeg = Math.abs(deg(ang));
            const dCue = dist(cueBall, ghost);
            const dPocket = dist(targetBall, pocket);
            const nearPocket = dPocket < NEAR_POCKET_THRESHOLD;

            // Direct shots (straight + cut)
            // Near-pocket balls allow wider cut angles since ball doesn't need to travel far
            const maxCutAngle = nearPocket ? 85 : 75;
            if (angDeg <= maxCutAngle) {
                let canMakeShot;
                if (nearPocket) {
                    // Ball is very close to pocket - easy to pocket
                    // Accept if cue can reach ghost OR target ball directly
                    // Target→pocket path is trivially clear (ball is at the pocket)
                    const ghostPathClear = checkPath(cueBall, ghost, obstacles, { relaxed: true }).clear;
                    const directPathClear = checkPath(cueBall, targetBall, obstacles, { relaxed: true }).clear;
                    canMakeShot = ghostPathClear || directPathClear;
                } else {
                    canMakeShot = isPathClear(cueBall, ghost, obstacles) &&
                                  isPathClear(targetBall, pocket, obstacles);
                }

                if (canMakeShot) {
                    const type = angDeg <= 10 ? 'straight' : 'cut';
                    let diff = shotDifficulty(ang, dCue + dPocket, type);
                    if (nearPocket) diff = Math.max(1, diff - 1); // easier when ball is near pocket
                    let cutType = angDeg < 10 ? '' : angDeg < 20 ? 'mỏng nhẹ' : angDeg < 40 ? 'vừa' : 'dày';
                    const cross = Math.sin(angle(targetBall, pocket) - angle(cueBall, targetBall));
                    const hitSide = cross > 0 ? 'phải' : 'trái';

                    const shot = {
                        type, typeName: type === 'straight' ? 'Đánh thẳng' : `Đánh cắt (${cutType})`,
                        pocket, ghostBall: ghost, cutAngleDeg: angDeg, cutType, hitSide,
                        distance: dCue, difficulty: diff, difficultyText: stars(diff),
                        nearPocket,
                        path: [
                            { from: cueBall, to: ghost, type: 'cue' },
                            { from: targetBall, to: pocket, type: 'target' },
                        ],
                    };
                    shot.cueAfter = predictCuePosition(cueBall, targetBall, pocket, spin, power);
                    shot.spinRec = recommendSpin(shot, cueBall, targetBall);
                    shot.risks = assessRisk(shot, cueBall, targetBall, obstacles);
                    shot.positionAdvice = positionAdvice(shot, shot.cueAfter);
                    shot.advice = generateAdvice(shot, cueBall, targetBall, obstacles);
                    shots.push(shot);
                }
            }

            // Bank shots (skip for near-pocket balls - direct shot is always easier than banking)
            if (!nearPocket) {
            for (const wall of WALLS) {
                let mirror;
                if (wall.reflect === 'y') mirror = { x: pocket.x, y: 2 * wall.value - pocket.y };
                else mirror = { x: 2 * wall.value - pocket.x, y: pocket.y };

                const gBank = ghostBallPos(targetBall, mirror);
                let bp;
                if (wall.reflect === 'y') {
                    const t = (wall.value - targetBall.y) / (mirror.y - targetBall.y);
                    if (t <= 0 || t > 1.5) continue;
                    bp = { x: targetBall.x + t * (mirror.x - targetBall.x), y: wall.value };
                } else {
                    const t = (wall.value - targetBall.x) / (mirror.x - targetBall.x);
                    if (t <= 0 || t > 1.5) continue;
                    bp = { x: wall.value, y: targetBall.y + t * (mirror.y - targetBall.y) };
                }

                if (bp.x < PLAY.left - 5 || bp.x > PLAY.right + 5 || bp.y < PLAY.top - 5 || bp.y > PLAY.bottom + 5) continue;
                let nearP = false;
                for (const p of POCKETS) { if (dist(bp, p) < TABLE.pocketRadius * 2) { nearP = true; break; } }
                if (nearP) continue;

                if (!isPathClear(cueBall, gBank, obstacles) ||
                    !checkPath(targetBall, bp, obstacles, { wallBounce: true }).clear ||
                    !checkPath(bp, pocket, obstacles, { wallBounce: true }).clear) continue;

                const td = dist(cueBall, gBank) + dist(targetBall, bp) + dist(bp, pocket);
                if (td > 1200) continue;
                const bAng = cutAngle(cueBall, targetBall, mirror);
                const bAngDeg = Math.abs(deg(bAng));
                if (bAngDeg > 70) continue;

                const diff = shotDifficulty(bAng, td, 'bank');
                const shot = {
                    type: 'bank', typeName: `Đánh băng (${wall.name})`,
                    pocket, ghostBall: gBank, bouncePoint: bp, wall,
                    cutAngleDeg: bAngDeg, distance: td,
                    difficulty: diff, difficultyText: stars(diff),
                    path: [
                        { from: cueBall, to: gBank, type: 'cue' },
                        { from: targetBall, to: bp, type: 'target-bank' },
                        { from: bp, to: pocket, type: 'target-bank-reflect' },
                    ],
                };
                shot.cueAfter = predictCuePosition(cueBall, targetBall, pocket, spin, power);
                shot.spinRec = recommendSpin(shot, cueBall, targetBall);
                shot.risks = assessRisk(shot, cueBall, targetBall, obstacles);
                shot.positionAdvice = positionAdvice(shot, shot.cueAfter);
                shot.advice = generateAdvice(shot, cueBall, targetBall, obstacles);
                shots.push(shot);
            }
            } // end if (!nearPocket) for bank shots

            // Kick shots - still valid for near-pocket balls when direct path is blocked
            for (const wall of WALLS) {
                let mirrorCue;
                if (wall.reflect === 'y') mirrorCue = { x: cueBall.x, y: 2 * wall.value - cueBall.y };
                else mirrorCue = { x: 2 * wall.value - cueBall.x, y: cueBall.y };

                const gKick = ghostBallPos(targetBall, pocket);
                let kbp;
                if (wall.reflect === 'y') {
                    const t = (wall.value - mirrorCue.y) / (gKick.y - mirrorCue.y);
                    if (t <= 0 || t > 1.5) continue;
                    kbp = { x: mirrorCue.x + t * (gKick.x - mirrorCue.x), y: wall.value };
                } else {
                    const t = (wall.value - mirrorCue.x) / (gKick.x - mirrorCue.x);
                    if (t <= 0 || t > 1.5) continue;
                    kbp = { x: wall.value, y: mirrorCue.y + t * (gKick.y - mirrorCue.y) };
                }

                if (kbp.x < PLAY.left - 5 || kbp.x > PLAY.right + 5 || kbp.y < PLAY.top - 5 || kbp.y > PLAY.bottom + 5) continue;
                let nearP = false;
                for (const p of POCKETS) { if (dist(kbp, p) < TABLE.pocketRadius * 2) { nearP = true; break; } }
                if (nearP) continue;

                // For near-pocket: skip target→pocket check (trivially clear) and use relaxed paths
                const kickOpts = nearPocket ? { relaxed: true, wallBounce: true } : { wallBounce: true };
                if (!checkPath(cueBall, kbp, obstacles, kickOpts).clear ||
                    !checkPath(kbp, gKick, obstacles, kickOpts).clear ||
                    (!nearPocket && !isPathClear(targetBall, pocket, obstacles))) continue;

                const td = dist(cueBall, kbp) + dist(kbp, gKick) + dist(targetBall, pocket);
                if (td > 1400) continue;
                const kAng = cutAngle(kbp, targetBall, pocket);
                const kAngDeg = Math.abs(deg(kAng));
                const maxKickAngle = nearPocket ? 80 : 65;
                if (kAngDeg > maxKickAngle) continue;

                const diff = shotDifficulty(kAng, td, 'kick');
                const shot = {
                    type: 'kick', typeName: `Kick shot (${wall.name})`,
                    pocket, ghostBall: gKick, bouncePoint: kbp, wall,
                    cutAngleDeg: kAngDeg, distance: td,
                    difficulty: diff, difficultyText: stars(diff),
                    path: [
                        { from: cueBall, to: kbp, type: 'cue-kick' },
                        { from: kbp, to: gKick, type: 'cue-kick-reflect' },
                        { from: targetBall, to: pocket, type: 'target' },
                    ],
                };
                shot.cueAfter = predictCuePosition(cueBall, targetBall, pocket, spin, power);
                shot.spinRec = recommendSpin(shot, cueBall, targetBall);
                shot.risks = assessRisk(shot, cueBall, targetBall, obstacles);
                shot.positionAdvice = positionAdvice(shot, shot.cueAfter);
                shot.advice = generateAdvice(shot, cueBall, targetBall, obstacles);
                shots.push(shot);
            }

            // ===== 2-CUSHION BANK SHOTS (target → w1 → w2 → pocket) =====
        if (!nearPocket) {
        for (const w1 of WALLS) {
            for (const w2 of WALLS) {
                if (w1 === w2) continue;
                const m1 = mirrorPoint(pocket, w2);
                const m2 = mirrorPoint(m1, w1);
                const gBank2 = ghostBallPos(targetBall, m2);
                const bAng2 = cutAngle(cueBall, targetBall, m2);
                const bAngDeg2 = Math.abs(deg(bAng2));
                if (bAngDeg2 > 70) continue;

                const bp1 = wallIntersect(targetBall, m2, w1);
                if (!isValidBounce(bp1)) continue;
                const bp2 = wallIntersect(bp1, m1, w2);
                if (!isValidBounce(bp2)) continue;

                if (!isPathClear(cueBall, gBank2, obstacles) ||
                    !checkPath(targetBall, bp1, obstacles, { wallBounce: true }).clear ||
                    !checkPath(bp1, bp2, obstacles, { wallBounce: true }).clear ||
                    !checkPath(bp2, pocket, obstacles, { wallBounce: true }).clear) continue;

                const td = dist(cueBall, gBank2) + dist(targetBall, bp1) + dist(bp1, bp2) + dist(bp2, pocket);
                if (td > 1600) continue;

                const diff2 = Math.min(5, shotDifficulty(bAng2, td, 'bank') + 1);
                const shot = {
                    type: 'bank', typeName: `2 băng (${w1.name}→${w2.name})`,
                    pocket, ghostBall: gBank2, bouncePoint: bp1,
                    bouncePoints: [bp1, bp2], walls: [w1, w2], multiCushion: 2,
                    cutAngleDeg: bAngDeg2, distance: td,
                    difficulty: diff2, difficultyText: stars(diff2),
                    path: [
                        { from: cueBall, to: gBank2, type: 'cue' },
                        { from: targetBall, to: bp1, type: 'target-bank' },
                        { from: bp1, to: bp2, type: 'target-bank-reflect' },
                        { from: bp2, to: pocket, type: 'target-bank-reflect' },
                    ],
                };
                shot.cueAfter = predictCuePosition(cueBall, targetBall, pocket, spin, power);
                shot.spinRec = recommendSpin(shot, cueBall, targetBall);
                shot.risks = assessRisk(shot, cueBall, targetBall, obstacles);
                shot.positionAdvice = positionAdvice(shot, shot.cueAfter);
                shot.advice = generateAdvice(shot, cueBall, targetBall, obstacles);
                shots.push(shot);
            }
        }
        }

        // ===== 2-CUSHION KICK SHOTS (cue → w1 → w2 → ghost) =====
        for (const w1 of WALLS) {
            for (const w2 of WALLS) {
                if (w1 === w2) continue;
                const gKick2 = ghostBallPos(targetBall, pocket);
                const g_m1 = mirrorPoint(gKick2, w2);
                const g_m2 = mirrorPoint(g_m1, w1);

                const kbp1 = wallIntersect(cueBall, g_m2, w1);
                if (!isValidBounce(kbp1)) continue;
                const kbp2 = wallIntersect(kbp1, g_m1, w2);
                if (!isValidBounce(kbp2)) continue;

                const kickOpts2 = nearPocket ? { relaxed: true, wallBounce: true } : { wallBounce: true };
                if (!checkPath(cueBall, kbp1, obstacles, kickOpts2).clear ||
                    !checkPath(kbp1, kbp2, obstacles, kickOpts2).clear ||
                    !checkPath(kbp2, gKick2, obstacles, kickOpts2).clear ||
                    (!nearPocket && !isPathClear(targetBall, pocket, obstacles))) continue;

                const td = dist(cueBall, kbp1) + dist(kbp1, kbp2) + dist(kbp2, gKick2) + dist(targetBall, pocket);
                if (td > 1600) continue;
                const kAng2 = cutAngle(kbp2, targetBall, pocket);
                const kAngDeg2 = Math.abs(deg(kAng2));
                if (kAngDeg2 > 65) continue;

                const diff2 = Math.min(5, shotDifficulty(kAng2, td, 'kick') + 1);
                const shot = {
                    type: 'kick', typeName: `2-kick (${w1.name}→${w2.name})`,
                    pocket, ghostBall: gKick2, bouncePoint: kbp1,
                    bouncePoints: [kbp1, kbp2], walls: [w1, w2], multiCushion: 2,
                    cutAngleDeg: kAngDeg2, distance: td,
                    difficulty: diff2, difficultyText: stars(diff2),
                    path: [
                        { from: cueBall, to: kbp1, type: 'cue-kick' },
                        { from: kbp1, to: kbp2, type: 'cue-kick-reflect' },
                        { from: kbp2, to: gKick2, type: 'cue-kick-reflect' },
                        { from: targetBall, to: pocket, type: 'target' },
                    ],
                };
                shot.cueAfter = predictCuePosition(cueBall, targetBall, pocket, spin, power);
                shot.spinRec = recommendSpin(shot, cueBall, targetBall);
                shot.risks = assessRisk(shot, cueBall, targetBall, obstacles);
                shot.positionAdvice = positionAdvice(shot, shot.cueAfter);
                shot.advice = generateAdvice(shot, cueBall, targetBall, obstacles);
                shots.push(shot);
            }
        }

        // ===== 3-CUSHION KICK SHOTS (cue → w1 → w2 → w3 → ghost) =====
        for (const w1 of WALLS) {
            for (const w2 of WALLS) {
                if (w2 === w1) continue;
                for (const w3 of WALLS) {
                    if (w3 === w2) continue;
                    const gKick3 = ghostBallPos(targetBall, pocket);
                    const gm1 = mirrorPoint(gKick3, w3);
                    const gm2 = mirrorPoint(gm1, w2);
                    const gm3 = mirrorPoint(gm2, w1);

                    const bp1 = wallIntersect(cueBall, gm3, w1);
                    if (!isValidBounce(bp1)) continue;
                    const bp2 = wallIntersect(bp1, gm2, w2);
                    if (!isValidBounce(bp2)) continue;
                    const bp3 = wallIntersect(bp2, gm1, w3);
                    if (!isValidBounce(bp3)) continue;

                    const wb3 = { wallBounce: true };
                    if (!checkPath(cueBall, bp1, obstacles, wb3).clear ||
                        !checkPath(bp1, bp2, obstacles, wb3).clear ||
                        !checkPath(bp2, bp3, obstacles, wb3).clear ||
                        !checkPath(bp3, gKick3, obstacles, wb3).clear ||
                        (!nearPocket && !isPathClear(targetBall, pocket, obstacles))) continue;

                    const td = dist(cueBall, bp1) + dist(bp1, bp2) + dist(bp2, bp3) + dist(bp3, gKick3) + dist(targetBall, pocket);
                    if (td > 2000) continue;
                    const kAng3 = cutAngle(bp3, targetBall, pocket);
                    const kAngDeg3 = Math.abs(deg(kAng3));
                    if (kAngDeg3 > 60) continue;

                    const diff3 = Math.min(5, shotDifficulty(kAng3, td, 'kick') + 2);
                    const shot = {
                        type: 'kick', typeName: `3-kick (${w1.name}→${w2.name}→${w3.name})`,
                        pocket, ghostBall: gKick3, bouncePoint: bp1,
                        bouncePoints: [bp1, bp2, bp3], walls: [w1, w2, w3], multiCushion: 3,
                        cutAngleDeg: kAngDeg3, distance: td,
                        difficulty: diff3, difficultyText: stars(diff3),
                        path: [
                            { from: cueBall, to: bp1, type: 'cue-kick' },
                            { from: bp1, to: bp2, type: 'cue-kick-reflect' },
                            { from: bp2, to: bp3, type: 'cue-kick-reflect' },
                            { from: bp3, to: gKick3, type: 'cue-kick-reflect' },
                            { from: targetBall, to: pocket, type: 'target' },
                        ],
                    };
                    shot.cueAfter = predictCuePosition(cueBall, targetBall, pocket, spin, power);
                    shot.spinRec = recommendSpin(shot, cueBall, targetBall);
                    shot.risks = assessRisk(shot, cueBall, targetBall, obstacles);
                    shot.positionAdvice = positionAdvice(shot, shot.cueAfter);
                    shot.advice = generateAdvice(shot, cueBall, targetBall, obstacles);
                    shots.push(shot);
                }
            }
        }

        } // end pocket loop

        // Sort: direct → 1-cushion → multi-cushion, then by difficulty
        shots.sort((a, b) => {
            const order = { straight: 0, cut: 1, bank: 2, kick: 3 };
            const oa = (order[a.type] || 9) + (a.multiCushion || 0) * 4;
            const ob = (order[b.type] || 9) + (b.multiCushion || 0) * 4;
            return oa - ob || a.difficulty - b.difficulty;
        });
        return shots;
    }

    // ========== CUE BALL PREDICTION ==========
    function predictCuePosition(cueBall, targetBall, pocket, spin, power) {
        const ghost = ghostBallPos(targetBall, pocket);
        const cueToGhost = angle(cueBall, ghost);
        const cutAng = norm(cueToGhost - angle(targetBall, pocket));
        const deflection = cueToGhost + Math.PI / 2 * (cutAng > 0 ? 1 : -1);
        const vSpin = spin.y, hSpin = spin.x;
        let dir;

        if (Math.abs(cutAng) < 0.1) {
            if (vSpin < -0.3) dir = cueToGhost + Math.PI;
            else if (vSpin > 0.3) dir = cueToGhost;
            else return { x: ghost.x, y: ghost.y, type: 'stop' };
        } else {
            dir = deflection + vSpin * 0.5;
        }
        dir += hSpin * 0.2;

        const travel = power * 25 * (1 + Math.abs(vSpin) * 0.5);
        let ex = ghost.x + Math.cos(dir) * travel;
        let ey = ghost.y + Math.sin(dir) * travel;
        ex = Math.max(PLAY.left + TABLE.ballRadius, Math.min(PLAY.right - TABLE.ballRadius, ex));
        ey = Math.max(PLAY.top + TABLE.ballRadius, Math.min(PLAY.bottom - TABLE.ballRadius, ey));

        return { x: ex, y: ey, type: vSpin < -0.3 ? 'draw' : vSpin > 0.3 ? 'follow' : 'natural' };
    }

    // ========== MULTI-BALL ANALYSIS ==========
    function analyzeMultiBall(cueBall, targetBalls, spin = { x: 0, y: 0 }, power = 5) {
        const results = [];
        for (let i = 0; i < targetBalls.length; i++) {
            const target = targetBalls[i];
            const obstacles = targetBalls.filter((_, idx) => idx !== i);
            const shots = findAllShots(cueBall, target, obstacles, spin, power);
            const blockedPaths = analyzeBlockedPaths(cueBall, target, obstacles);

            results.push({ ballIndex: i, ball: target, shots, blockedPaths });
        }
        results.sort((a, b) => {
            const ba = a.shots.length > 0 ? a.shots[0].difficulty : 99;
            const bb = b.shots.length > 0 ? b.shots[0].difficulty : 99;
            return ba - bb;
        });
        return results;
    }

    // Keep backward compat
    function analyzeShots(cueBall, targetBall, spin, power) {
        return findAllShots(cueBall, targetBall, [], spin || { x: 0, y: 0 }, power || 5);
    }

    function describeSpinEffect(spin) {
        const parts = [];
        if (spin.y < -0.3) parts.push('Draw (kéo)');
        else if (spin.y > 0.3) parts.push('Follow (đẩy)');
        else parts.push('Stop/Stun');
        if (Math.abs(spin.x) > 0.3) parts.push(`English ${spin.x < 0 ? 'trái' : 'phải'}`);
        return parts.join(' + ');
    }

    return {
        TABLE, PLAY, POCKETS, WALLS,
        analyzeShots, analyzeMultiBall, findAllShots,
        ghostBallPos, dist, angleBetween: angle, degFromRad: deg,
        difficultyStars: stars, predictCueBallPosition: predictCuePosition,
        describeSpinEffect, analyzeBlockedPaths, recommendSpin,
    };
})();
