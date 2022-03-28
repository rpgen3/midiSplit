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
        [
            'deleteBtn',
            'table'
        ].map(v => `https://rpgen3.github.io/midiSplit/css/${v}.css`),
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
    const [isSplitDrum, isRemoveChord, isShift, isReset] = (() => {
        const {html} = addHideArea('setting flag');
        const isSplitDrum = rpgen3.addInputBool(html, {
            label: 'ドラムを楽器ごとに分割',
            save: true,
            value: true
        });
        const isRemoveChord = rpgen3.addInputBool(html, {
            label: '和音を単音化',
            save: true,
            value: true
        });
        const isShift = rpgen3.addInputBool(html, {
            label: '無音部分を削除し詰める',
            save: true,
            value: true
        });
        const isReset = rpgen3.addInputBool(html, {
            label: 'トラックを連番で再割り当て',
            save: true,
            value: true
        });
        return [isSplitDrum, isRemoveChord, isShift, isReset];
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
    rpgen3.addBtn(main, 'start split', () => {
        if(!g_midi) return table.text('Error: Must input MIDI file.');
        const {timeDivision} = g_midi; // 4分音符の長さ
        output(
            timeDivision,
            isShift(),
            isReset(),
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
              times = [0, ...[...splitPoints].map(v => v - 1).filter(v => 0 < v && v < end).sort((a, b) => a - b).concat(end).map(v => v * bar)],
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
    const calcColor = (rgb, max, value) => rgb + (value / max * 0xFF | 0).toString(16);
    const toMidiChannel = str => {
        const ch = String(str);
        return Number(ch.includes('-') ? ch.split('-')[0] : ch);
    }
    const output = (timeDivision, isShift, isReset, bpm, [times, map]) => {
        table.empty();
        const bar = timeDivision * 4,
              max = 2 * Math.max(...[...map.values()].map(v => [...v.values()].map(v => v.length)).flat()),
              tr = $('<tr>').appendTo($('<thead>').appendTo(table));
        $('<th>').appendTo(tr);
        for(const v of times) $('<th>').appendTo(tr).text(v / bar + 1);
        const tbody = $('<tbody>').appendTo(table),
              sorted = [...map.keys()].sort();
        for(const ch of sorted) {
            const m = map.get(ch),
                  tr = $('<tr>').appendTo(tbody);
            $('<th>').appendTo(tr).text(ch);
            for(const time of times) {
                if(!m.has(time)) continue;
                const t = time / bar,
                      a = toMidiTrack(m.get(time), time);
                if(isShift) {
                    const {when} = a[0];
                    for(const v of a) v.when -= when;
                }
                $('<td>').appendTo(tr).text(a.length).css({
                    backgroundColor: calcColor('#73B8E2', max, a.length)
                }).on('click', () => {
                    rpgen3.download(
                        rpgen4.toMIDI({
                            tracks: [[toMidiChannel(ch), a]],
                            bpm,
                            div: timeDivision
                        }),
                        `midiSplit - ${ch} at ${t}.mid`
                    );
                });
            }
        }
        {
            const max = 2 * Math.max(...times.map(time => [...map.values()].filter(v => v.has(time)).reduce((p, x) => p + x.get(time).length, 0))),
                  tr = $('<tr>').appendTo(tbody);
            $('<th>').appendTo(tr).text('all');
            for(const time of times) {
                const tracks = [];
                let i = 0;
                for(const ch of sorted) {
                    const m = map.get(ch);
                    if(!m.has(time)) continue;
                    tracks.push([isReset ? i++ : toMidiChannel(ch), toMidiTrack(m.get(time), time)]);
                }
                const len = tracks.reduce((p, x) => p + x[1].length, 0);
                if(isShift) {
                    const min = Math.min(...tracks.map(v => v[1][0]))
                    for(const track of tracks) for(const v of track) v.when -= min;
                }
                $('<td>').appendTo(tr).text(len).css({
                    backgroundColor: calcColor('#f3981d', max, len)
                }).on('click', () => {
                    rpgen3.download(
                        rpgen4.toMIDI({
                            tracks,
                            bpm,
                            div: timeDivision
                        }),
                        `midiSplit - all at ${time}.mid`
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
