"""Stateless reference models. Units and approximations: docs/QUANTUM_LAB.md."""
import math


def number(data, key, default, low, high):
    value = data.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{key} must be a finite number in [{low}, {high}]")
    return value


def transmon(data):
    ej = number(data, 'ejGHz', 20, 1, 100)
    ec = number(data, 'ecGHz', .3, .05, 2)
    ng = number(data, 'ng', 0, -.5, .5)
    n = 15
    matrix = [[4*ec*(i-7-ng)**2 if i == j else -ej/2 if abs(i-j) == 1 else 0 for j in range(n)] for i in range(n)]
    a = [r[:] for r in matrix]
    for _ in range(3000):
        p, q = max(((i, j) for i in range(n) for j in range(i+1, n)), key=lambda ij: abs(a[ij[0]][ij[1]]))
        if abs(a[p][q]) < 1e-11:
            break
        theta = .5*math.atan2(2*a[p][q], a[q][q]-a[p][p])
        c, s = math.cos(theta), math.sin(theta)
        pp, qq, pq = a[p][p], a[q][q], a[p][q]
        for k in range(n):
            if k not in (p, q):
                kp, kq = a[k][p], a[k][q]
                a[k][p] = a[p][k] = c*kp-s*kq
                a[k][q] = a[q][k] = s*kp+c*kq
        a[p][p] = c*c*pp-2*s*c*pq+s*s*qq
        a[q][q] = s*s*pp+2*s*c*pq+c*c*qq
        a[p][q] = a[q][p] = 0
    eigen = sorted(a[i][i] for i in range(n))
    levels = [v-eigen[0] for v in eigen[:5]]
    return dict(ratio=ej/ec, levels=levels, f01GHz=levels[1], anharmonicityGHz=levels[2]-2*levels[1], matrix=matrix)


def rabi(data):
    omega = number(data, 'omegaMHz', 10, 0, 100)
    delta = number(data, 'detuningMHz', 0, -100, 100)
    duration = number(data, 'durationNs', 50, 0, 10000)
    phase = math.radians(number(data, 'phaseDeg', 0, -360, 360))
    t2 = number(data, 't2us', 100, .000001, 20000)
    norm = math.hypot(omega, delta)
    angle = 2*math.pi*norm*duration/1000
    a, d = (omega/norm, delta/norm) if norm else (0, 0)
    s, c = math.sin(angle/2), math.cos(angle/2)
    ideal = a*a*s*s
    contrast = math.exp(-duration/1000/t2)
    unitary = [[[c, -d*s], [-a*s*math.sin(phase), -a*s*math.cos(phase)]], [[a*s*math.sin(phase), -a*s*math.cos(phase)], [c, d*s]]]
    return dict(idealP1=ideal, p1=ideal*contrast+(1-contrast)/2, piNs=500/omega if omega else None, angleRad=angle, unitary=unitary)


def sensing(data):
    kind = data.get('kind', 'magnetic')
    if kind not in ('magnetic', 'clock', 'gravity'):
        raise ValueError('kind must be magnetic, clock or gravity')
    signal = number(data, 'signal', 1, -1000, 1000)
    time_ms = number(data, 'timeMS', 1, .001, 1000)
    t2 = number(data, 't2MS', 10, .01, 5000)
    contrast = number(data, 'contrast', .95, 0, 1)*math.exp(-time_ms/t2)
    shots = number(data, 'shots', 4096, 1, 50000)
    if int(shots) != shots:
        raise ValueError('shots must be integer')
    phase0 = math.radians(number(data, 'analysisPhase', 90, -180, 180))
    t = time_ms/1000
    slope = 2*math.pi*28*t if kind == 'magnetic' else 2*math.pi*t if kind == 'clock' else 1.61e7*t*t*1e-6
    phase = slope*signal+phase0
    p = (1+contrast*math.cos(phase))/2
    return dict(phase=phase, contrast=contrast, p1=p, quadratureUncertainty=1/(contrast*slope*math.sqrt(shots)) if contrast*slope else None)


def cryogenics(data):
    """Heat balance endpoint; dynamic plant stepping is browser-local."""
    lines = number(data, 'lines', 24, 0, 128)
    applied = number(data, 'heatUW', .2, 0, 100)
    flow = number(data, 'flowUMol', 400, 0, 1000)*1e-6
    valve = number(data, 'valve', 50, 0, 100)/100
    n = flow*valve
    heat = applied+lines*.008
    return dict(heatUW=heat, conductionUW=lines*.008, flowMolS=n,
                equilibriumK=max(.01, math.sqrt(heat*1e-6/(84*n)+.008**2)) if n else 300,
                coolingAt20mKUW=84*n*(.02**2-.008**2)*1e6)


def environment(data):
    amplitude = number(data, 'vibrationNM', 5, 0, 10000)
    frequency = number(data, 'frequencyHz', 20, .1, 200)
    damping = number(data, 'damping', .2, .05, 2)
    rf = number(data, 'rfVM', 1, 0, 100)
    shielding = number(data, 'shieldDB', 60, 0, 140)
    magnetic = number(data, 'magNT', 10, 0, 10000)
    factor = number(data, 'magShield', 100, 1, 10000)
    r = frequency/3
    transfer = math.sqrt((1+(2*damping*r)**2)/((1-r*r)**2+(2*damping*r)**2))
    residual = amplitude*transfer
    phase = 2*math.pi*residual/780
    return dict(transfer=transfer, residualNM=residual, alignmentUM=residual/1000,
                phaseRMS=phase, contrast=math.exp(-phase*phase/2), rfResidualVM=rf*10**(-shielding/20), magResidualNT=magnetic/factor)


MODELS = {'transmon': transmon, 'rabi': rabi, 'sensing': sensing, 'cryogenics': cryogenics, 'environment': environment}
