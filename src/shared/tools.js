import kc from "../components/UserManager";

export const JSDB_STATE = process.env.REACT_APP_JSDB_STATE;
export const JSRP_BACKEND = process.env.REACT_APP_JSRP_BACKEND;
export const GXY_BACKEND = process.env.REACT_APP_GXY_BACKEND;
export const PIRATI = process.env.REACT_APP_PIRATI;
export const TEST = process.env.REACT_APP_TEST;
export const MERKAZ_MAIN = process.env.REACT_APP_MERKAZ_MAIN;
export const MERKAZ_BACKUP = process.env.REACT_APP_MERKAZ_BACKUP;
export const VPN_MAIN = process.env.REACT_APP_VPN_MAIN;
export const VPN_BACKUP = process.env.REACT_APP_VPN_BACKUP;
export const DECODER_MAIN = process.env.REACT_APP_DECODER_MAIN;
export const DECODER_BACKUP = process.env.REACT_APP_DECODER_BACKUP;
export const DECODER_TEST = process.env.REACT_APP_DECODER_TEST;
export const PROXY_BACKEND = process.env.REACT_APP_PROXY_BACKEND;
export const SRV_URL = process.env.REACT_APP_SRV_URL;
export const LIVE_URL = process.env.REACT_APP_LIVE_URL;
export const KC_URL = process.env.REACT_APP_KC_URL;
//export const MQTT_URL = process.env.REACT_APP_MQTT_LCL_URL;
export const MQTT_URL = process.env.REACT_APP_MQTT_LCL_URL;
export const STUN_SRV_GXY = process.env.REACT_APP_STUN_SRV_GXY;

var p = {};

export const destroyStream = () => {
    if(window["out"+1]) window["out"+1].remove()
    clearInterval(p[1])
}

function getBufferAverage(analyser) {
    var array =  new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(array);
    var average = getAverageVolume(array);
    return average;
}

function getAverageVolume(array) {
    var values = 0;
    var average;
    var length = array.length;
    for (var i = 0; i < length; i++) {
        values += array[i];
    }
    average = values / length;
    return average;
}

const stereoVisualizer = (analyser1, analyser2, canvas, width, n) => {
    let mn = width/128;

    let drawContext = canvas.getContext('2d');
    let gradient = drawContext.createLinearGradient(0,0,width,10);
    gradient.addColorStop(0,'green');
    gradient.addColorStop(0.20,'#80ff00');
    gradient.addColorStop(0.85,'orange');
    gradient.addColorStop(1,'red');

    let sampleAudioStream = () => {
        let average1 = getBufferAverage(analyser1);
        let average2 = getBufferAverage(analyser2);
        drawContext.clearRect(0, 0, width, 40);
        drawContext.fillStyle=gradient;
        drawContext.fillRect(0,0,average1*mn,10);
        drawContext.fillRect(0,15, average2*mn,10);
    };

    p[n] = setInterval(sampleAudioStream, 50);
};

const streamVisualizer = (analyser, canvas, width, n) => {
    let mn = width/128;

    let drawContext = canvas.getContext('2d');
    let gradient = drawContext.createLinearGradient(0,0,width,10);
    gradient.addColorStop(0,'green');
    gradient.addColorStop(0.20,'#80ff00');
    gradient.addColorStop(0.85,'orange');
    gradient.addColorStop(1,'red');

    let sampleAudioStream = () => {
        let average = getBufferAverage(analyser);
        drawContext.clearRect(0, 0, width, 40);
        drawContext.fillStyle=gradient;
        drawContext.fillRect(0,0,average*mn,10);
    };

    p[n] = setInterval(sampleAudioStream, 50);
};

export const cloneStream = (stream, n, stereo) => {
    let context = new AudioContext();
    let source = context.createMediaStreamSource(stream);
    let destination = context.createMediaStreamDestination();
    source.connect(destination);
    window["out"+n] = new Audio();
    window["out"+n].srcObject = destination.stream;
    window["out"+n].play();
    let device = localStorage.getItem("device" + n);
    if(device) {
        window["out"+n].setSinkId(device)
            .then(() => Janus.log('Success, audio output device attached: ' + device))
            .catch((error) => Janus.error(error));
    }
    if(stereo) {
        let analyser1 = context.createAnalyser();
        let analyser2 = context.createAnalyser();
        let splitter = context.createChannelSplitter(2);
        source.connect(splitter);
        splitter.connect(analyser1,0,0);
        splitter.connect(analyser2,1,0);
        stereoVisualizer(analyser1, analyser2, document.getElementById('canvas'+n),630,n);
    } else {
        let analyzer = context.createAnalyser();
        source.connect(analyzer);
        streamVisualizer(analyzer, document.getElementById('canvas'+n),630,n);
    }
};

export const randomString = (len) => {
    let charSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let randomString = "";
    for (let i = 0; i < len; i++) {
        let randomPoz = Math.floor(Math.random() * charSet.length);
        randomString += charSet.substring(randomPoz, randomPoz + 1);
    }
    return randomString;
};

export const toHms = (totalSec) => {
    let d = parseInt(totalSec / (3600*24));
    let h = parseInt( totalSec / 3600 , 10) % 24;
    let m = parseInt( totalSec / 60 , 10) % 60;
    let s = (totalSec % 60).toFixed(0);
    if (s < 0) s = 0;
    return (d > 0 ? d + "d " : "") + (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m) + ":" + (s  < 10 ? "0" + s : s);
};

export const totalSeconds = (time) => {
    let parts = time.split(':');
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

export const getPercent = (total,current) => {
    let percent = (100 * totalSeconds(current) / totalSeconds(total)).toFixed(0);
    percent = +percent || 0;
    return percent;
};

export const streamFetcher = (ip, path, data, cb) => fetch(`http://${ip}:8081/${path}`, {
    method: 'PUT',
    headers: {
        'Authorization': 'bearer ' + kc.token,
        'Content-Type': 'application/json'
    },
    body:  JSON.stringify(data)
})
    .then((response) => {
        if (response.ok) {
            return response.json().then(respond => cb(respond));
        }
    })
    .catch(ex => cb(null));

export const proxyFetcher = (data, cb) => fetch(`${PROXY_BACKEND}`, {
    method: 'PUT',
    headers: {
        'Authorization': 'bearer ' + kc.token,
        'Content-Type': 'application/json'
    },
    body:  JSON.stringify(data)
})
    .then((response) => {
        if (response.ok) {
            return response.json().then(respond => cb(respond));
        }
    })
    .catch(ex => console.log("Put Data error:", ex));

export const getData = (path, cb) => fetch(`${JSDB_STATE}/${path}`, {
        headers: {'Content-Type': 'application/json'}
    })
    .then((response) => {
        if (response.ok) {
            return response.json().then(data => cb(data));
        }
    })
    .catch(ex => console.log(`get ${path}`, ex));

export const getRooms = (cb) => fetch(`${GXY_BACKEND}`, {
    headers: {'Authorization': 'bearer ' + kc.token, 'Content-Type': 'application/json'}
})
    .then((response) => {
        if (response.ok) {
            return response.json().then(data => cb(data));
        }
    })
    .catch(ex => console.log(`get rooms`, ex));

export const getStreamUrl = (lang, cb) => {
    const qv = lang.match(/^(heb|rus|eng|fre|spa|ita|ger)$/) ? "hd" : "high";
    fetch(`${LIVE_URL}-${lang}-${qv}.js`)
        .then((response) => {
            if (response.ok) {
                return response.text().then(data => {
                    let url = JSON.parse(data.split("(")[1].split(")")[0])
                    cb(url.hlsUrl)
                })
            }
        })
        .catch(ex => console.log(`get ${lang}`, ex));
};

export const getService = (path, cb) => fetch(`${SRV_URL}/${path}`, {
        headers: {'Authorization': 'bearer ' + kc.token, 'Content-Type': 'application/json'}
    })
    .then((response) => {
        if (response.ok) {
            return response.json().then(data => cb(data));
        }
    })
    .catch(ex => console.log(`get ${path}`, ex));

export const getWorkflowData = (path, cb) => fetch(`${JSRP_BACKEND}/${path}`, {
        headers: {'Authorization': 'bearer ' + kc.token, 'Content-Type': 'application/json'}
    })
    .then((response) => {
        if (response.ok) {
            return response.json().then(data => cb(data));
        }
    })
    .catch(ex => console.log(`get ${path}`, ex));

export const putData = (path, data, cb) => fetch(`${JSDB_STATE}/${path}`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body:  JSON.stringify(data)
})
    .then((response) => {
        if (response.ok) {
            return response.json().then(respond => cb(respond));
        }
    })
    .catch(ex => console.log("Put Data error:", ex));

export const removeData = (path, cb) => fetch(`${JSDB_STATE}/${path}`, {
    method: 'DELETE',
    headers: {'Content-Type': 'application/json'},
})
    .then((response) => {
        if (response.ok) {
            return response.json().then(respond => cb(respond));
        }
    })
    .catch(ex => console.log("Remove Data error:", ex));

export const vrate_options = [
    { key: '24000', text: '24000k', value: '24000' },
    { key: '12000', text: '12000k', value: '12000' },
    { key: '8000', text: '8000k', value: '8000' },
    { key: '4000', text: '4000k', value: '4000' },
    { key: '2500', text: '2500k', value: '2500' },
    { key: '2000', text: '2000k', value: '2000' },
    { key: '1000', text: '1000k', value: '1000' },
    { key: '600', text: '600k', value: '600' },
    { key: '300', text: '300k', value: '300' },
];

export const vres_options = [
    { key: 'Hi50', text: 'HD 50i', value: 'Hi50' },
    { key: 'Hp25', text: 'HD 25p', value: 'Hp25' },
    { key: 'pal', text: 'SD 50i', value: 'pal' },
];

export const arate_options = [
    { key: '2048', text: '2048k', value: '2048' },
    { key: '1024', text: '1024k', value: '1024' },
    { key: '512', text: '512k', value: '512' },
    { key: '256', text: '256k', value: '256' },
    { key: '128', text: '128k', value: '128' },
    { key: '64', text: '64k', value: '64' },
];

export const channels_options = [
    { key: 'da', text: 'Da', value: 'da' },
    { key: '16', text: '16', value: '16' },
    { key: '8', text: '8', value: '8' },
    { key: '2', text: '2', value: '2' },
];

export const langch_options = [
    { key: '27', text: '27', value: '27' },
    { key: '24', text: '24', value: '24' },
    { key: '8', text: '8', value: '8' },
    { key: '2', text: '2', value: '2' },
];

export const encstr_options = [
    { key: 'ffmpeg', text: 'FFMPEG', value: 'ffmpeg' },
    { key: 'gstreamer', text: 'GST', value: 'gstreamer' },
];

export const encrec_options = [
    { key: 'yes', text: 'Yes', value: 'yes' },
    { key: 'no', text: 'No', value: 'no' },
];

export const protocol_options = [
    { key: 'rtp', text: 'RTP', value: 'rtp' },
    { key: 'rtmp', text: 'RTMP', value: 'rtmp' },
    { key: 'mpegts', text: 'MPEG-TS', value: 'mpegts' },
    { key: 'webrtc', text: 'WebRTC', value: 'webrtc' },
];

export const rtcpip_options = [
    { key: 'pirati', text: 'Pirati', value: `${PIRATI}` },
    { key: 'test', text: 'Test', value: `${TEST}` },
    { key: 'main', text: 'Merkaz-Main', value: `${MERKAZ_MAIN}` },
    { key: 'backup', text: 'Merkaz-Backup', value: `${MERKAZ_BACKUP}` },
    { key: 'backup_vpn', text: 'VPN-Backup', value: `${VPN_BACKUP}` },
    { key: 'main_vpn', text: 'VPN-Main', value: `${VPN_MAIN}` },
];

export const dest_options = [
    { key: 'test', text: 'Decoder Test', value: `${DECODER_TEST}` },
    { key: 'decoder_main', text: 'Decoder Main', value: `${DECODER_MAIN}` },
    { key: 'decoder_backup', text: 'Decoder Backup', value: `${DECODER_BACKUP}` },
];

export const buffer_options = [
    { key: '2000', text: '2000ms', value: '2000' },
    { key: '1000', text: '1000ms', value: '1000' },
    { key: '900', text: '900ms', value: '900' },
    { key: '800', text: '800ms', value: '800' },
    { key: '700', text: '700ms', value: '700' },
    { key: '600', text: '600ms', value: '600' },
    { key: '500', text: '500ms', value: '500' },
    { key: '400', text: '400ms', value: '400' },
    { key: '300', text: '300ms', value: '300' },
    { key: '200', text: '200ms', value: '200' },
    { key: '100', text: '100ms', value: '100' },
];

export const rstr_options = [
    { key: 'heb', text: 'Hebrew', value: 'heb' },
    { key: 'rus', text: 'Russian', value: 'rus' },
    { key: 'eng', text: 'English', value: 'eng' },
    { key: 'spa', text: 'Spanish', value: 'spa' },
    { key: 'fre', text: 'French', value: 'fre' },
    { key: 'ita', text: 'Italian', value: 'ita' },
    { key: 'ger', text: 'German', value: 'ger' },
    { key: 'por', text: 'Portuguese', value: 'por' },
    { key: 'ukr', text: 'Ukraine', value: 'ukr' },
];

export const id_options = [
    { key: 'yt', text: 'YouTube', value: 'yt' },
    { key: 'fb', text: 'Facebook', value: 'fb' },
];
