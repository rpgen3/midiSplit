(async () => {
    const {importAll, getScript} = await import(`https://rpgen3.github.io/mylib/export/import.mjs`);
    await Promise.all([
        'https://code.jquery.com/jquery-3.3.1.min.js',
        'https://colxi.info/midi-parser-js/src/main.js'
    ].map(getScript));
    const {$, MidiParser} = window;
    const html = $('body').empty().css({
        'text-align': 'center',
        padding: '1em',
        'user-select': 'none'
    });
    const head = $('<header>').appendTo(html),
          main = $('<main>').appendTo(html),
          foot = $('<footer>').appendTo(html);
    $('<h1>').appendTo(head).text('MIDI分割');
    $('<h2>').appendTo(head).text('指定したタイミングでMIDIを分割');
    const rpgen3 = await importAll([
        [
            'input',
            'css',
            'util'
        ].map(v => `https://rpgen3.github.io/mylib/export/${v}.mjs`)
    ].flat());
    const rpgen4 = await importAll([
        'https://rpgen3.github.io/maze/mjs/heap/Heap.mjs',
        [
            [
                'fixTrack',
                'toMIDI'
            ].map(v => `midi/${v}`)
        ].flat().map(v => `https://rpgen3.github.io/piano/mjs/${v}.mjs`)
    ].flat());
    Promise.all([
        'https://rpgen3.github.io/midiSplit/css/deleteBtn.css',
        'https://rpgen3.github.io/mapMaker/css/table.css',
        [
            'container',
            'tab',
            'img',
            'btn'
        ].map(v => `https://rpgen3.github.io/spatialFilter/css/${v}.css`)
    ].flat().map(rpgen3.addCSS));
    const hideTime = 500;
    const addHideArea = (label, parentNode = main) => {
        const html = $('<div>').addClass('container').appendTo(parentNode);
        const input = rpgen3.addInputBool(html, {
            label,
            save: true,
            value: true
        });
        const area = $('<dl>').appendTo(html);
        input.elm.on('change', () => input() ? area.show(hideTime) : area.hide(hideTime)).trigger('change');
        return Object.assign(input, {
            get html(){
                return area;
            }
        });
    };
    let g_midi = null;
    {
        const {html} = addHideArea('input MIDI file');
        $('<dt>').appendTo(html).text('MIDIファイル');
        const inputFile = $('<input>').appendTo($('<dd>').appendTo(html)).prop({
            type: 'file',
            accept: '.mid'
        });
        MidiParser.parse(inputFile.get(0), v => {
            g_midi = v;
        });
    }
    const [isSplitDrum, isRemoveChord] = (() => {
        const {html} = addHideArea('setting flag');
        const isSplitDrum = rpgen3.addInputBool(html, {
            label: 'ドラムチャンネルを楽器ごとに分割',
            save: true,
            value: true
        });
        const isRemoveChord = rpgen3.addInputBool(html, {
            label: '和音チャンネルを単音化',
            save: true,
            value: true
        });
        return [isSplitDrum, isRemoveChord];
    })();
    const splitPoints = (() => {
        const {html} = addHideArea('setting split point');
        const inputSplitPoint = rpgen3.addInputStr(html, {
            label: '何小節目で分割するか'
        });
        const list = new Set;
        $('<dd>').appendTo(html);
        rpgen3.addBtn(html, 'add', () => {
            const n = Number(inputSplitPoint());
            if(Number.isNaN(n) || list.has(n)) return;
            list.add(n);
            const e = $('<dd>').appendTo(html).text(n);
            rpgen3.addBtn(e, '×', () => {
                e.remove();
                list.delete(n);
            }).addClass('deleteBtn');
        }).addClass('btn');
        return list;
    })();
    rpgen3.addBtn(html, 'start split', () => {
        const {timeDivision} = g_midi; // 4分音符の長さ
        output(
            timeDivision,
            getBPM(g_midi),
            splitLength(
                timeDivision,
                splitPoints,
                splitChannel(
                    isSplitDrum(),
                    isRemoveChord(),
                    parseMidi(g_midi)
                )
            )
        );
    }).addClass('btn');
    const table = $('<table>').appendTo(addHideArea('output MIDI file').html);
    const getBPM = midi => {
        const {track} = midi;
        let bpm = 0;
        for(const {event} of track) {
            for(const v of event) {
                if(v.type !== 0xFF || v.metaType !== 0x51) continue;
                bpm = 6E7 / v.data;
                break;
            }
            if(bpm) break;
        }
        if(bpm) return bpm;
        else throw 'BPM is none.';
    };
    const parseMidi = midi => {
        const {track, timeDivision} = midi,
              heap = new rpgen4.Heap();
        for(const {event} of track) {
            const now = new Map;
            let currentTime = 0;
            for(const {deltaTime, type, data, channel} of event) {
                currentTime += deltaTime;
                if(type !== 8 && type !== 9) continue;
                const [pitch, velocity] = data,
                      isNoteOFF = type === 8 || !velocity;
                if(now.has(pitch) && isNoteOFF) {
                    const unit = now.get(pitch);
                    unit.end = currentTime;
                    heap.add(unit.start, unit);
                    now.delete(pitch);
                }
                else if(!isNoteOFF) now.set(pitch, new MidiUnit({
                    ch: channel,
                    pitch,
                    velocity,
                    start: currentTime
                }));
            }
        }
        return heap;
    };
    class MidiUnit {
        constructor({ch, pitch, velocity, start}){
            this.ch = ch;
            this.pitch = pitch;
            this.velocity = velocity;
            this.start = start;
            this.end = -1;
        }
    }
    const makeSafelyGet = m => k => {
        if(!m.has(k)) m.set(k, []);
        return m.get(k);
    };
    const splitChannel = (isSplitDrum, isRemoveChord, heap) => {
        const m = new Map,
              get = makeSafelyGet(m);
        for(const v of heap) {
            const {ch, pitch} = v;
            if(ch === 9 && isSplitDrum) get(`${ch}-${pitch}`).push(v);
            else {
                const a = get(ch);
                if(ch !== 9 && isRemoveChord && a.length) {
                    const _v = a[a.length - 1];
                    if(v.start === _v.start) {
                        if(v.end < _v.end) a.pop();
                        else continue;
                    }
                }
                a.push(v);
            }
        }
        return m;
    };
    const splitLength = (timeDivision, splitPoints, channels) => {
        const bar = timeDivision * 4,
              end = Math.max(...[...channels.values()].filter(v => v.length).map(v => v[v.length - 1].end)) / bar,
              times = [0, ...[...splitPoints].filter(v => 0 < v && v < end).sort((a, b) => a - b).concat(end).map(v => v * bar)],
              map = new Map;
        for(const [k, v] of channels) {
            const m = new Map,
                  get = makeSafelyGet(m);
            map.set(k, m);
            let i = 0;
            for(const _v of v) {
                const {start, end} = _v;
                while(start >= times[i]) i++;
                get(times[i - 1]).push(_v);
                let w = _v,
                    j = i;
                while(end > times[j]) {
                    const _w = {...w};
                    w.end = _w.start = times[j];
                    get(times[j]).push(_w);
                    w = _w;
                    j++;
                }
            }
        }
        times.pop();
        return [times, map];
    };
    const output = (timeDivision, bpm, [times, map]) => {
        table.empty();
        const bar = timeDivision * 4,
              max = Math.max(...[...map.values()].map(v => [...v.values()].map(v => v.length)).flat()),
              tr = $('<tr>').appendTo(table);
        $('<th>').appendTo(tr);
        for(const v of times) $('<th>').appendTo(tr).text(v / bar);
        for(const [ch, m] of map) {
            const tr = $('<tr>').appendTo(table);
            $('<th>').appendTo(tr).text(ch);
            for(const time of times) {
                const td = $('<td>').appendTo(tr);
                if(!m.has(time)) continue;
                const t = time / bar,
                      a = m.get(time);
                td.text(a.length).css({
                    backgroundColor: '#73B8E2' + (a.length / max * 0xFF).toString(16)
                }).on('click', () => {
                    const _ch = ch.includes('-') ? Number(ch.split('-')[0]) : ch;
                    rpgen3.download(
                        rpgen4.toMIDI([[_ch, toMidiTrack(a, time)]], bpm, timeDivision),
                        `midiSplit - ${ch} at ${t}.mid`
                    );
                });
            }
        }
    };
    const toMidiTrack = (units, time) => {
        const heap = new rpgen4.Heap();
        for(const {
            pitch,
            velocity,
            start,
            end
        } of units) {
            for(const [i, v] of [
                start - time,
                end - time
            ].entries()) heap.add(v, {
                pitch,
                velocity: i === 0 ? 100 : 0,
                when: v
            });
        }
        return rpgen4.fixTrack([...heap]);
    };
})();
