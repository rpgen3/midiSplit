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
    Promise.all([
        'https://rpgen3.github.io/midiSplit/css/deleteBtn.css',
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
    {
        const {html} = addHideArea('setting flag');
        const isDrumSplit = rpgen3.addInputBool(html, {
            label: 'ドラムトラックを楽器ごとに分割',
            save: true,
            value: true
        });
    }
    {
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
    }
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
    const parseMidi = async midi => { // pitch, volume, duration
        const {track, timeDivision} = midi,
              heap = new rpgen4.Heap();
        for(const {event} of track) {
            const now = new Map;
            let currentTime = 0;
            for(const {deltaTime, type, data, channel} of event) { // 全noteを回収
                currentTime += deltaTime;
                if(type !== 8 && type !== 9) continue;
                const [pitch, velocity] = data,
                      isNoteOFF = type === 8 || !velocity;
                if(now.has(pitch) && isNoteOFF) {
                    const unit = now.get(pitch);
                    unit.end = currentTime;
                    heap.push(unit.start, unit);
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
        while(timeline.length) timeline.pop();
        endTime = 0;
        const deltaToSec = 60 / getBPM(midi) / timeDivision;
        for(const {ch, pitch, velocity, start, end} of heap) {
            const [_start, _end] = [start, end].map(v => v * deltaToSec);
            timeline.push(new AudioUnit({
                ch,
                pitch,
                volume: velocity / 0x7F,
                when: _start,
                duration: _end - _start
            }));
            if(endTime < _end) endTime = _end;
        }
        endTime += coolTime;
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
    class AudioUnit {
        constructor({ch, pitch, volume, when, duration}){
            this.ch = ch;
            this.pitch = pitch;
            this.volume = volume;
            this.when = when;
            this.duration = duration;
        }
    }
})();
