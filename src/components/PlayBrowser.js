import React, {Component} from 'react'
import Hls from "hls.js";
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  Table,
  Segment,
  Label,
  Dropdown,
  Grid,
  GridRow,
  GridColumn, Button, Input, Icon, Checkbox
} from 'semantic-ui-react'
import {
  getData,
  getWorkflowData,
  langch_options,
  MDB_UNIT_URL,
  putData, removeData,
  streamFetcher,
  toHms,
  vres_options
} from "../shared/tools";
import {
  getCachedKeyframes,
  getKeyframes,
  isOnKeyframe,
  preloadKeyframes,
  snapMs,
  stepKeyframe
} from "../shared/keyframes";


class Playouts extends Component {

  constructor(props) {
    super(props);
    this.playerRef = React.createRef();
  }

  state = {
    autoplay: false,
    disabled: true,
    main: [],
    backup: [],
    trimmed: [],
    date: new Date().toLocaleDateString('sv'),
    startDate: new Date(),
    playlistDate: new Date(),
    files: [],
    file_data: "",
    file_name: "",
    playout: {},
    id: "",
    status: "Off",
    file_source: "",
    hls_source: "",
    trim_meta: {},
    src: "Workflow",
    year: "2020",
    month: "01",
    lang_options: [],
    selected_lang: 7,
    video_options: [],
    selected_video: 0,
    playlist: [],
    playlist_name: "",
    playlist_db: {},
    playlist_options: [],
    selected_playlist: "",
    inpoint: [],
    outpoint: [],
    end_hafaka: null,
    isHls: true,
    editingPlaylistIndex: null,
    showSettings: false,
    hasUnsavedChanges: false,
    forwardSkipValue: "",
    sadnaInOuts: [],
    currentSadnaIndex: null,
    currentInOutIndex: null,
    shiftAudio: 0,
    shiftVideo: 0,
    keyframes: null,        // Int32Array of keyframe start times (ms) for the loaded file
    keyframeStatus: "",     // '' | 'loading' | 'ok' | 'unavailable'
    keyframeCount: 0,
    snapInfo: {}            // pair index -> {delta, status: 'kf'|'stale'|'pending'|'unavailable'}
  };

  componentDidMount() {
    try {
      getData('shidur/playlist', playlist_db => {
        console.log(playlist_db);
        this.setState({playlist_db})
      })
      this.getWorkflow(this.state.date);
      this.initHls();
    } catch (error) {
      console.error('Error in componentDidMount:', error);
    }
  };

  componentWillUnmount() {
    // Clean up HLS instance to prevent memory leaks
    if (this.state.hls) {
      try {
        this.state.hls.destroy();
      } catch (error) {
        console.log('Error destroying HLS:', error);
      }
    }
  }

  initHls = () => {
    const video = this.playerRef.current;
    if (Hls.isSupported()) {
      const hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        // Add more stable configuration options
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000, // 60MB
        maxBufferHole: 0.5,
        // Disable features that can cause seeking issues
        enableSoftwareAES: false,
        // Better seeking configuration
        seekHoleNudgeDuration: 0.1,
        seekNudgeDuration: 0.1
      });
      
      this.setState({hls})
      
      // Safely attach media with error handling
      try {
        hls.attachMedia(video);
        
        // Add error handling for HLS events
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.log('HLS Error:', data);
          if (data.fatal) {
            switch(data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Network error, trying to recover...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Media error, trying to recover...');
                hls.recoverMediaError();
                break;
              default:
                console.log('Fatal error, destroying HLS instance');
                hls.destroy();
                break;
            }
          }
        });
        
        // Add ready state handling
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('HLS manifest parsed successfully');
        });
        
        // Add seeking event handling to prevent InterstitialsController errors
        hls.on(Hls.Events.SEEKING, () => {
          console.log('HLS seeking started');
        });
        
        hls.on(Hls.Events.SEEKED, () => {
          console.log('HLS seeking completed');
        });
        
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
          try {
            const lang_options = [];
            const video_options = [];

            if (hls.allAudioTracks && hls.allAudioTracks.length > 0) {
              hls.allAudioTracks.forEach(k => {
                // Switch to hebrew
                if(k.lang === "he") {
                  hls.audioTrack = k.id;
                  this.setState({selected_lang: k.id})
                }
                const val = {key:k.lang, text:k.name, value:k.id};
                lang_options.push(val)
              });
              this.setState({lang_options});
            }

            if (hls.levels && hls.levels.length > 0) {
              hls.levels.forEach((k,i) => {
                const val = {key:k.height, text:k.height, value:i};
                video_options.push(val)
              });
              hls.currentLevel = 0;
              this.setState({video_options});
            }
          } catch (error) {
            console.log('Error in AUDIO_TRACKS_UPDATED:', error);
          }
        });
        
      } catch (error) {
        console.log('Error initializing HLS:', error);
      }
    } else {
      console.log('HLS not supported in this browser');
    }
  };

  // '/backup/files/sources/2016/11/11/x.mp4' -> '2016/11/11/x.mp4'. Works for both the workflow
  // record and the synthetic file_data built by loadPlaylistItemToPlayer.
  currentFilePath = () => {
    const {file_data} = this.state;
    const filename = file_data && file_data.source && file_data.source.converted && file_data.source.converted.filename;
    if (!filename) return null;
    const parts = filename.split('/backup/files/sources/');
    return parts.length > 1 ? parts[1] : null;
  };

  currentFileDuration = () => {
    const {file_data} = this.state;
    const duration = file_data && file_data.source && file_data.source.converted && file_data.source.converted.duration;
    return Number(duration) || 0;
  };

  // Fetch the keyframe index for the loaded file and flag any already-loaded in points that sit
  // off a keyframe — that is how a playlist saved before this change announces itself.
  loadKeyframesFor = (file_path, durationSec) => {
    if (!file_path) {
      this.setState({keyframes: null, keyframeStatus: 'unavailable', keyframeCount: 0});
      return;
    }
    this.setState({keyframes: null, keyframeStatus: 'loading', keyframeCount: 0});
    getKeyframes(file_path, durationSec).then(entry => {
      if (this.currentFilePath() !== file_path) return;   // operator switched files mid-fetch
      if (!entry.ok) {
        this.setState({keyframes: null, keyframeStatus: 'unavailable', keyframeCount: 0});
        return;
      }
      this.setState(prev => {
        const snapInfo = {...prev.snapInfo};
        prev.inpoint.forEach((value, i) => {
          if (value === null || value === undefined) return;
          const snapped = snapMs(entry.times, value);
          if (snapped === value) snapInfo[i] = {delta: 0, status: 'kf'};
          else snapInfo[i] = {delta: snapped - value, status: 'stale'};
        });
        return {keyframes: entry.times, keyframeStatus: 'ok', keyframeCount: entry.count, snapInfo};
      });
    });
  };

  // Single place that writes an in point together with its badge.
  applyInPoint = (index, value, delta, status) => {
    console.log(":: Set IN for pair", index, ":", value, "(kf delta:", delta, "ms, status:", status, ")");
    this.setState(prev => {
      const inpoint = [...prev.inpoint];
      inpoint[index] = value;
      return {
        inpoint,
        snapInfo: {...prev.snapInfo, [index]: {delta, status}},
        currentInOutIndex: index,
        hasUnsavedChanges: true
      };
    });
  };

  // Null-safe pair-level snap shared by setIn, savePlaylist and the export aligner.
  snapPairIn = (inVal, outVal, times) => {
    if (inVal === null || inVal === undefined || !times) return inVal;
    const snapped = snapMs(times, inVal);
    if (snapped === inVal) return inVal;
    // Never let a snap invert or collapse a pair.
    if (outVal !== null && outVal !== undefined && outVal - snapped < 100) return inVal;
    return snapped;
  };

  setIn = (index) => {
    if (index === null) {
      // Clear all in/out points
      const { editingPlaylistIndex, playlist } = this.state;
      let updatedPlaylist = playlist;
      if (editingPlaylistIndex !== null && editingPlaylistIndex !== undefined && playlist && playlist[editingPlaylistIndex]) {
        updatedPlaylist = [...playlist];
        const item = { ...updatedPlaylist[editingPlaylistIndex] };
        item.inpoint = [];
        item.outpoint = [];
        item.end_hafaka = null;
        if (item.file_path) {
          // Preserve shift parameters if they exist
          let shiftSegment = '';
          if (item.shiftAudio !== 0 || item.shiftVideo !== 0) {
            shiftSegment = '/shift';
            if (item.shiftAudio && item.shiftAudio !== 0) shiftSegment += `/a${item.shiftAudio}`;
            if (item.shiftVideo && item.shiftVideo !== 0) shiftSegment += `/v${item.shiftVideo}`;
          }
          item.hls_path = `https://src.bbdomain.org/${item.file_path}${shiftSegment}/master.m3u8`;
        }
        updatedPlaylist[editingPlaylistIndex] = item;
      }
      this.setState({
        inpoint: [],
        outpoint: [],
        end_hafaka: null,
        sadnaInOuts: [],
        currentSadnaIndex: null,
        currentInOutIndex: null,
        snapInfo: {},
        playlist: updatedPlaylist,
        hasUnsavedChanges: true
      });
      return;
    }
    
    const currentTime = this.playerRef.current.currentTime;
    const flooredTime = Math.floor(currentTime) * 1000;
    const file_path = this.currentFilePath();
    const cached = getCachedKeyframes(file_path);

    // Fast path — the index was prefetched when the file loaded, so this is the normal case.
    if (cached && cached.ok) {
      const snapped = this.snapPairIn(flooredTime, this.state.outpoint[index], cached.times);
      this.applyInPoint(index, snapped, snapped - flooredTime, 'kf');
      return;
    }

    // Not ready yet: store the floored value now and patch it when the index arrives.
    this.applyInPoint(index, flooredTime, 0, cached ? 'unavailable' : 'pending');
    if (cached) return;   // known-bad file, do not refetch on every click

    getKeyframes(file_path, this.currentFileDuration()).then(entry => {
      if (this.currentFilePath() !== file_path) return;         // operator switched files
      if (this.state.inpoint[index] !== flooredTime) return;    // value changed meanwhile
      if (!entry.ok) {
        this.setState(prev => ({snapInfo: {...prev.snapInfo, [index]: {delta: 0, status: 'unavailable'}}}));
        return;
      }
      const snapped = this.snapPairIn(flooredTime, this.state.outpoint[index], entry.times);
      this.applyInPoint(index, snapped, snapped - flooredTime, 'kf');
    });
  };

  // Step an in point to the adjacent keyframe (the nudge buttons on the pair row).
  nudgeIn = (index, dir) => {
    const {keyframes, inpoint, outpoint} = this.state;
    const current = inpoint[index];
    if (!keyframes || current === null || current === undefined) return;

    const stepped = stepKeyframe(keyframes, current, dir);
    if (stepped === current) return;
    if (outpoint[index] !== null && outpoint[index] !== undefined && outpoint[index] - stepped < 100) {
      console.log(":: Nudge IN rejected for pair", index, "- would collapse the pair");
      return;
    }
    console.log(":: Nudge IN for pair", index, ":", current, "->", stepped);
    this.setState(prev => {
      const updated = [...prev.inpoint];
      updated[index] = stepped;
      return {
        inpoint: updated,
        snapInfo: {...prev.snapInfo, [index]: {delta: 0, status: 'kf'}},
        currentInOutIndex: index,
        hasUnsavedChanges: true
      };
    });
    this.jumpPoint(stepped);
  };

  // Walk the playhead one keyframe at a time. The player always holds the unclipped file, so
  // its timeline and the keyframe list share an origin.
  skipToKeyframe = (dir) => {
    const {keyframes} = this.state;
    if (!keyframes || !this.playerRef.current) return;
    const currentMs = Math.round(this.playerRef.current.currentTime * 1000);
    const target = stepKeyframe(keyframes, currentMs, dir);
    console.log(":: Jump to keyframe:", currentMs, "->", target);
    this.jumpPoint(target);
  };

  setOut = (index) => {
    let currentTime = this.playerRef.current.currentTime;
    let alignedTime = Math.ceil(currentTime) * 1000;
    console.log(":: Set OUT for pair", index, ":", alignedTime, "(original:", currentTime * 1000, ")");
    
    const { outpoint, inpoint } = this.state;
    const updatedOutpoints = [...outpoint];
    updatedOutpoints[index] = alignedTime;
    
    // Auto-set IN point to 0 if not set for this pair
    const updatedInpoints = [...inpoint];
    if (updatedInpoints[index] === null || updatedInpoints[index] === undefined) {
      const { editingPlaylistIndex, playlist } = this.state;
      const savedIn = (editingPlaylistIndex !== null && editingPlaylistIndex !== undefined && 
                      playlist[editingPlaylistIndex] && 
                      Array.isArray(playlist[editingPlaylistIndex].inpoint)) 
                      ? playlist[editingPlaylistIndex].inpoint[index] : null;
      if (savedIn === null || savedIn === undefined) {
        updatedInpoints[index] = 0;
        console.log(":: Auto-set IN point to 0 for pair", index);
      }
    }
    
    this.setState({ 
      outpoint: updatedOutpoints, 
      inpoint: updatedInpoints,
      currentInOutIndex: index,
      hasUnsavedChanges: true 
    });
  };

  setEndHafaka = () => {
    let currentTime = this.playerRef.current.currentTime;
    let alignedTime = Math.ceil(currentTime) * 1000;
    console.log(":: Set END HAFAKA: ", alignedTime, "(original:", currentTime * 1000, ")");
    this.setState({end_hafaka: alignedTime, hasUnsavedChanges: true});
  };

  addInOutPair = () => {
    const { inpoint, outpoint } = this.state;
    const updatedIn = [...inpoint, null];
    const updatedOut = [...outpoint, null];
    this.setState({ 
      inpoint: updatedIn, 
      outpoint: updatedOut,
      currentInOutIndex: updatedIn.length - 1,
      hasUnsavedChanges: true 
    });
    console.log(":: Added new in/out pair at index:", updatedIn.length - 1);
  };

  removeInOutPair = (index) => {
    const { inpoint, outpoint, currentInOutIndex, snapInfo } = this.state;
    const updatedIn = inpoint.filter((_, i) => i !== index);
    const updatedOut = outpoint.filter((_, i) => i !== index);
    let newCurrentIndex = currentInOutIndex;
    if (currentInOutIndex === index) {
      newCurrentIndex = null;
    } else if (currentInOutIndex > index) {
      newCurrentIndex = currentInOutIndex - 1;
    }
    // Badges are keyed by pair index, so they have to shift down with the pairs.
    const updatedSnapInfo = {};
    Object.keys(snapInfo).forEach(key => {
      const i = Number(key);
      if (i < index) updatedSnapInfo[i] = snapInfo[key];
      else if (i > index) updatedSnapInfo[i - 1] = snapInfo[key];
    });
    this.setState({
      inpoint: updatedIn,
      outpoint: updatedOut,
      currentInOutIndex: newCurrentIndex,
      snapInfo: updatedSnapInfo,
      hasUnsavedChanges: true
    });
    console.log(":: Removed in/out pair at index:", index);
  };

  clearInOutPairs = () => {
    this.setState({
      inpoint: [],
      outpoint: [],
      currentInOutIndex: null,
      snapInfo: {},
      hasUnsavedChanges: true
    });
    console.log(":: Cleared all in/out pairs");
  };

  addSadnaPair = () => {
    const { sadnaInOuts } = this.state;
    const newPair = { in: null, out: null };
    const updatedSadna = [...sadnaInOuts, newPair];
    this.setState({ 
      sadnaInOuts: updatedSadna, 
      currentSadnaIndex: updatedSadna.length - 1,
      hasUnsavedChanges: true 
    });
    console.log(":: Added new sadna pair at index:", updatedSadna.length - 1);
  };

  removeSadnaPair = (index) => {
    const { sadnaInOuts, currentSadnaIndex } = this.state;
    const updatedSadna = sadnaInOuts.filter((_, i) => i !== index);
    let newCurrentIndex = currentSadnaIndex;
    if (currentSadnaIndex === index) {
      newCurrentIndex = null;
    } else if (currentSadnaIndex > index) {
      newCurrentIndex = currentSadnaIndex - 1;
    }
    this.setState({ 
      sadnaInOuts: updatedSadna, 
      currentSadnaIndex: newCurrentIndex,
      hasUnsavedChanges: true 
    });
    console.log(":: Removed sadna pair at index:", index);
  };

  setSadnaIn = (index) => {
    let currentTime = this.playerRef.current.currentTime;
    let alignedTime = Math.floor(currentTime) * 1000;
    console.log(":: Set Sadna IN for pair", index, ":", alignedTime, "(original:", currentTime * 1000, ")");
    
    const { sadnaInOuts } = this.state;
    const updatedSadna = [...sadnaInOuts];
    if (!updatedSadna[index]) {
      updatedSadna[index] = { in: null, out: null };
    }
    updatedSadna[index] = { ...updatedSadna[index], in: alignedTime };
    
    this.setState({ 
      sadnaInOuts: updatedSadna, 
      currentSadnaIndex: index,
      hasUnsavedChanges: true 
    });
  };

  setSadnaOut = (index) => {
    let currentTime = this.playerRef.current.currentTime;
    let alignedTime = Math.ceil(currentTime) * 1000;
    console.log(":: Set Sadna OUT for pair", index, ":", alignedTime, "(original:", currentTime * 1000, ")");
    
    const { sadnaInOuts } = this.state;
    const updatedSadna = [...sadnaInOuts];
    if (!updatedSadna[index]) {
      updatedSadna[index] = { in: null, out: null };
    }
    updatedSadna[index] = { ...updatedSadna[index], out: alignedTime };
    
    this.setState({ 
      sadnaInOuts: updatedSadna, 
      currentSadnaIndex: index,
      hasUnsavedChanges: true 
    });
  };

  clearSadnaInOuts = () => {
    this.setState({ 
      sadnaInOuts: [], 
      currentSadnaIndex: null,
      hasUnsavedChanges: true 
    });
    console.log(":: Cleared all sadna pairs");
  };

  getWorkflow = (date) => {
    getWorkflowData(`source/find?key=date&value=${date}`, (data) => {
      console.log(":: Got workflow: ",data);
      this.setState({files: data})
    });
  };

  selectFile = (sourceId) => {
    console.log(":: Select file by source_id: ", sourceId);
    const {hls, files, shiftAudio, shiftVideo} = this.state;
    
    if (!hls) {
      console.log("HLS not initialized");
      return;
    }
    
    // Find the file data by source_id
    const data = files.find(file => file.source_id === sourceId);
    if (!data) {
      console.log("File not found for source_id:", sourceId);
      return;
    }
    
    try {
      let file_source = `https://wf.kab.info/wfapi${data.source.converted.filename}`

      // External kmedia
      //let hls_source = `https://cdn.kab.info/${data.source.kmedia.file_uid}.m3u8`
      //hls.loadSource(hls_source);

      // Local kmdeia
      // const path = data.source.kmedia.filename.split('/backup/files/kmedia/')[1]
      // const uid = data.source.kmedia.file_uid
       //let hls_source = `https://hls.bbdomain.org/${uid}/${path}/master.m3u8`

      // Local source
      const path = data.source.converted.filename.split('/backup/files/sources/')[1]
      
      // Build shift path segment if needed: /shift/a{audio}/v{video}/
      let shiftSegment = '';
      if (shiftAudio !== 0 || shiftVideo !== 0) {
        shiftSegment = '/shift';
        if (shiftAudio !== 0) shiftSegment += `/a${shiftAudio}`;
        if (shiftVideo !== 0) shiftSegment += `/v${shiftVideo}`;
      }
      
      let hls_source = `https://src.bbdomain.org/${path}${shiftSegment}/master.m3u8`
      
      // Safely load the source
      hls.loadSource(hls_source);
      console.log('Loaded source with shift:', hls_source);
      this.setState({hls_source, file_source, file_data: data, file_name: data.file_name, disabled: false, inpoint: [], outpoint: [], end_hafaka: null, sadnaInOuts: [], currentSadnaIndex: null, currentInOutIndex: null, shiftAudio: 0, shiftVideo: 0, editingPlaylistIndex: null, snapInfo: {}});
      this.loadKeyframesFor(path, data.source.converted.duration);
    } catch (error) {
      console.log("Error loading file:", error);
    }
  };

  setSrc = (src) => {
    this.setState({src, disabled: true, file_data: ""});
  };

  changeDate = (data) => {
    let date = data.toLocaleDateString('sv');
    this.setState({startDate: data, date});
    this.getWorkflow(date)
  };

  findByUID = () => {
    const {find_uid} = this.state;
    getWorkflowData(`source/js/line?uid=${find_uid}`, (data) => {
      console.log(":: Got workflow: ",data);
      this.setState({files: data})
    });
  }

  setLang = (val) => {
    console.log(val)
    this.state.hls.audioTrack = val;
    this.setState({selected_lang: val})
  };

  setVideo = (val) => {
    console.log(val)
    this.state.hls.currentLevel = val;
    this.setState({selected_video: val})
  };

  addToPlaylist = () => {
    const {isHls, inpoint, outpoint, end_hafaka, hls_source, file_data, playlist, sadnaInOuts, shiftAudio, shiftVideo} = this.state;
    const {source_id, sha1, file_name, line: {uid}, source: {converted: {filename, file_uid, duration}}} = file_data;
    const path = filename.split('/backup/files/sources/')[1]
    
    // Use arrays for in/out points
    const finalInpoints = [...inpoint];
    const finalOutpoints = [...outpoint];
    
    // Generate HLS path (use first pair if available, otherwise full file)
    let hls_path;
    if (finalInpoints.length > 0 && finalInpoints[0] !== null && finalInpoints[0] !== undefined && 
        finalOutpoints.length > 0 && finalOutpoints[0] !== null && finalOutpoints[0] !== undefined) {
      // Build shift path segment if needed: /shift/a{audio}/v{video}/
      let shiftSegment = '';
      if (shiftAudio !== 0 || shiftVideo !== 0) {
        shiftSegment = '/shift';
        if (shiftAudio !== 0) shiftSegment += `/a${shiftAudio}`;
        if (shiftVideo !== 0) shiftSegment += `/v${shiftVideo}`;
      }
      hls_path = `https://src.bbdomain.org/${path}/clipFrom/${finalInpoints[0]}/clipTo/${finalOutpoints[0]}${shiftSegment}/master.m3u8`;
    } else {
      // For full file, include shift if needed
      let shiftSegment = '';
      if (shiftAudio !== 0 || shiftVideo !== 0) {
        shiftSegment = '/shift';
        if (shiftAudio !== 0) shiftSegment += `/a${shiftAudio}`;
        if (shiftVideo !== 0) shiftSegment += `/v${shiftVideo}`;
      }
      hls_path = `https://src.bbdomain.org/${path}${shiftSegment}/master.m3u8`;
    }
    
    const playraw = {
      source_id, sha1, file_name, uid, file_uid, duration, 
      file_path: path, hls_path, isHls, 
      inpoint: finalInpoints, 
      outpoint: finalOutpoints, 
      end_hafaka, 
      sadnaInOuts: [...sadnaInOuts],
      shiftAudio: shiftAudio || 0,  // audio shift in milliseconds
      shiftVideo: shiftVideo || 0   // video shift in milliseconds
    };
    playlist.push(playraw);
    // Don't clear in/out pairs - keep them visible for next item
    this.setState({
      playlist, 
      hasUnsavedChanges: true
    });
    console.log(playlist)
  };

  savePlaylist = () => {
    const {autoplay, playlist, playlist_name, playlistDate, editingPlaylistIndex, inpoint, outpoint, end_hafaka, sadnaInOuts, shiftAudio, shiftVideo} = this.state;
    const date = playlistDate.toUTCString();

    // Build the final playlist synchronously with any live edits applied
    let finalPlaylist = playlist;
    let snappedIn = inpoint;
    let snapApplied = false;
    if (editingPlaylistIndex !== null && editingPlaylistIndex !== undefined && playlist[editingPlaylistIndex]) {
      const updated = [...playlist];

      // Migrate in points saved before keyframe snapping existed, so that what was previewed
      // and what gets exported are the same cut.
      const kf = getCachedKeyframes(playlist[editingPlaylistIndex].file_path);
      snapApplied = !!(kf && kf.ok);
      snappedIn = snapApplied ? inpoint.map((v, i) => this.snapPairIn(v, outpoint[i], kf.times)) : [...inpoint];
      const snapMoved = snappedIn.filter((v, i) => v !== inpoint[i]).length;
      if (snapMoved) console.log(":: Save: keyframe-aligned", snapMoved, "in point(s)", inpoint, "->", snappedIn);

      updated[editingPlaylistIndex] = {
        ...updated[editingPlaylistIndex],
        inpoint: [...snappedIn],
        outpoint: [...outpoint],
        end_hafaka,
        sadnaInOuts: [...sadnaInOuts],
        shiftAudio: shiftAudio || 0,
        shiftVideo: shiftVideo || 0
      };
      // Update HLS path if we have valid first in/out pair (allow inpoint=0)
      if (snappedIn.length > 0 && snappedIn[0] !== null && snappedIn[0] !== undefined &&
          outpoint.length > 0 && outpoint[0] !== null && outpoint[0] !== undefined) {
        const { file_path } = updated[editingPlaylistIndex];
        
        // Build shift path segment if needed: /shift/a{audio}/v{video}/
        let shiftSegment = '';
        if (shiftAudio !== 0 || shiftVideo !== 0) {
          shiftSegment = '/shift';
          if (shiftAudio !== 0) shiftSegment += `/a${shiftAudio}`;
          if (shiftVideo !== 0) shiftSegment += `/v${shiftVideo}`;
        }
        
        let hls_path = `https://src.bbdomain.org/${file_path}/clipFrom/${snappedIn[0]}/clipTo/${outpoint[0]}${shiftSegment}/master.m3u8`;
        updated[editingPlaylistIndex].hls_path = hls_path;
      } else {
        // Also update HLS path for full file if no in/out points
        const { file_path } = updated[editingPlaylistIndex];
        
        // Build shift path segment if needed
        let shiftSegment = '';
        if (shiftAudio !== 0 || shiftVideo !== 0) {
          shiftSegment = '/shift';
          if (shiftAudio !== 0) shiftSegment += `/a${shiftAudio}`;
          if (shiftVideo !== 0) shiftSegment += `/v${shiftVideo}`;
        }
        
        let hls_path = `https://src.bbdomain.org/${file_path}${shiftSegment}/master.m3u8`;
        updated[editingPlaylistIndex].hls_path = hls_path;
      }
      finalPlaylist = updated;
    }

    // Guard: prevent save if any item lacks end_hafaka
    const missingEnd = (finalPlaylist || []).some(r => !r || r.end_hafaka === null || r.end_hafaka === undefined);
    if (missingEnd) {
      alert('Cannot save: All playlist items must have End Hafaka set.');
      return;
    }

    // Calculate total duration using first inpoint -> end_hafaka
    const total = toHms((finalPlaylist || []).map((r) => {
      if (!r) return 0;
      const firstIn = (Array.isArray(r.inpoint) && r.inpoint.length > 0) ? r.inpoint[0] : null;
      if (firstIn !== null && firstIn !== undefined && r.end_hafaka !== null && r.end_hafaka !== undefined) {
        return (r.end_hafaka - firstIn) / 1000;
      }
      return Number(r.duration) || 0;
    }).reduce((su, cur) => su + cur, 0));

    const json = {autoplay, playlist: finalPlaylist, date, total}
    putData(`shidur/playlist/${playlist_name}`, json, data => {
      console.log(":: Save playlist: ", json, data);
      // Reflect saved data in state and refresh playlist_db so Load uses fresh data
      // Update local playlist_db entry immediately
      this.setState(prev => {
        const updatedDb = { ...(prev.playlist_db || {}) };
        updatedDb[playlist_name] = { autoplay, playlist: finalPlaylist, date, total };
        // Keep the live editing state on the values that were actually persisted, so the
        // badges settle on 'kf' after a save that migrated an older row.
        const snapInfo = {...prev.snapInfo};
        if (snapApplied) {
          snappedIn.forEach((value, i) => {
            if (value !== null && value !== undefined) snapInfo[i] = {delta: 0, status: 'kf'};
          });
        }
        return { playlist: finalPlaylist, playlist_db: updatedDb, hasUnsavedChanges: false, inpoint: [...snappedIn], snapInfo };
      });
      // Also re-fetch from server to ensure canonical data
      try {
        getData('shidur/playlist', playlist_db => {
          this.setState({playlist_db});
        });
      } catch (e) { console.log('Refresh playlist_db failed:', e); }
    } )
  };

  // Keyframe-align every in point across all saved playlists before exporting. Returns a copy —
  // it never mutates state and never persists, so a playlist saved before this change is fixed
  // on the way out but is only migrated permanently when an operator re-saves it.
  // Never throws: a file whose keyframe index cannot be fetched is exported as authored.
  alignPlaylistDbToKeyframes = async (playlist_db) => {
    const db = {};
    const adjustments = [];
    const unavailable = [];
    const shiftWarnings = [];

    const names = Object.keys(playlist_db || {});
    const sources = [];
    const seen = new Set();
    names.forEach(name => {
      const items = (playlist_db[name] && playlist_db[name].playlist) || [];
      items.forEach(item => {
        if (item && item.file_path && !seen.has(item.file_path)) {
          seen.add(item.file_path);
          sources.push({file_path: item.file_path, duration: item.duration});
        }
      });
    });

    try {
      await preloadKeyframes(sources, 4, 30000);
    } catch (e) {
      console.log(':: Keyframe preload failed, exporting as authored:', e);
    }

    names.forEach(name => {
      const playlistData = playlist_db[name] || {};
      const items = playlistData.playlist || [];
      db[name] = {
        ...playlistData,
        playlist: items.map(item => {
          if (!item || !Array.isArray(item.inpoint)) return item;
          const entry = getCachedKeyframes(item.file_path);
          if (!entry || !entry.ok) {
            if (item.file_path && unavailable.indexOf(item.file_path) === -1) unavailable.push(item.file_path);
            return item;
          }
          const outpoints = Array.isArray(item.outpoint) ? item.outpoint : [];
          const snapped = item.inpoint.map((v, i) => this.snapPairIn(v, outpoints[i], entry.times));
          const moved = snapped.filter((v, i) => v !== item.inpoint[i]).length;
          if (!moved) return item;

          snapped.forEach((v, i) => {
            if (v !== item.inpoint[i]) {
              adjustments.push({playlistName: name, file_name: item.file_name, pair: i, from: item.inpoint[i], to: v, delta: v - item.inpoint[i]});
            }
          });
          // A hand-dialled shift entered to compensate for this very skew will now
          // double-correct. Surface it rather than silently overwriting the operator's value.
          if (item.shiftAudio || item.shiftVideo) {
            shiftWarnings.push(`${name} / ${item.file_name} (a${item.shiftAudio || 0} v${item.shiftVideo || 0})`);
          }
          return {...item, inpoint: snapped};
        })
      };
    });

    console.log(":: Keyframe align:", adjustments.length, "adjusted,", unavailable.length, "file(s) unavailable");
    return {db, adjustments, unavailable, shiftWarnings};
  };

  generatePlaylist = async () => {
    try {
      const { playlist_db } = this.state;

      // Align first: the Companion loop below rebases sadna cues against item.inpoint[0], so it
      // has to read the aligned values or every cue drifts by the snap delta.
      const alignment = await this.alignPlaylistDbToKeyframes(playlist_db);
      const aligned_db = alignment.db;

      // Prepare companion variables for all playlists
      const companionVariables = {};
      
      // Get all playlist names and sort them to ensure consistent numbering
      const playlistNames = Object.keys(aligned_db).sort();

      playlistNames.forEach((playlistName, playlistIndex) => {
        const playlistNum = playlistIndex + 1; // 1-indexed
        const playlistData = aligned_db[playlistName];
        const items = playlistData.playlist || [];
        
        // Collect all sadna pairs from all items in this playlist
        // Sadna values are stored RELATIVE to the clip's in point
        const allSadnaPairs = [];
        items.forEach(item => {
          if (item.sadnaInOuts && Array.isArray(item.sadnaInOuts)) {
            // Get the first in point of this item (clip start)
            const clipInPoint = (Array.isArray(item.inpoint) && item.inpoint.length > 0 && item.inpoint[0] !== null) 
              ? item.inpoint[0] 
              : 0;
            
            item.sadnaInOuts.forEach(pair => {
              if (pair.in !== null && pair.in !== undefined && pair.out !== null && pair.out !== undefined) {
                // Calculate relative to clip in point
                allSadnaPairs.push({
                  in: pair.in - clipInPoint,
                  out: pair.out - clipInPoint
                });
              }
            });
          }
        });
        
        // Pad to 50 pairs with zeros
        for (let i = 1; i <= 50; i++) {
          const pairIndex = i - 1;
          if (pairIndex < allSadnaPairs.length) {
            // Convert milliseconds to seconds for companion (relative to clip start).
            // Clamped: snapping IN forward can push a cue that sat right on the in point
            // marginally negative.
            companionVariables[`Ply${playlistNum}SadnaIn_${i}`] = Math.max(0, Math.floor(allSadnaPairs[pairIndex].in / 1000));
            companionVariables[`Ply${playlistNum}SadnaOut_${i}`] = Math.max(0, Math.floor(allSadnaPairs[pairIndex].out / 1000));
          } else {
            // Pad with 0
            companionVariables[`Ply${playlistNum}SadnaIn_${i}`] = 0;
            companionVariables[`Ply${playlistNum}SadnaOut_${i}`] = 0;
          }
        }
      });
      
      console.log('Sending companion variables:', companionVariables);
      
      // Send to companion server using individual POST requests for each variable
      const companionUrl = process.env.REACT_APP_COMPANION_URL || 'http://localhost:8000';
      const variableNames = Object.keys(companionVariables);
      let companionSuccessCount = 0;
      let companionFailCount = 0;
      const companionErrors = [];
      
      for (const varName of variableNames) {
        const value = companionVariables[varName];
        try {
          const response = await fetch(`${companionUrl}/api/custom-variable/${varName}/value?value=${value}`, {
            method: 'POST'
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          companionSuccessCount++;
          console.log(`✓ Companion: Set ${varName} = ${value}`);
        } catch (error) {
          companionFailCount++;
          companionErrors.push(`${varName}: ${error.message}`);
          console.error(`✗ Companion: Failed to set ${varName}:`, error);
        }
      }
      
      console.log(`Companion update complete: ${companionSuccessCount} success, ${companionFailCount} failed`);
      
      // Generate and send VOD JSON files
      console.log('Generating VOD JSON files...');
      const vodUrl = process.env.REACT_APP_VOD_URL || 'http://10.66.1.76';
      let vodSuccessCount = 0;
      let vodFailCount = 0;
      const vodErrors = [];
      
      // First, clear all existing VOD maps
      try {
        console.log('Clearing existing VOD maps...');
        const clearResponse = await fetch(`${vodUrl}/api/vod-maps`, {
          method: 'DELETE'
        });
        
        if (clearResponse.ok) {
          const clearResult = await clearResponse.json();
          console.log(`✓ Cleared ${clearResult.deletedCount || 0} existing VOD maps`);
        } else {
          console.warn('Warning: Could not clear existing VOD maps');
        }
      } catch (clearError) {
        console.warn('Warning: Could not clear existing VOD maps:', clearError.message);
        // Continue anyway - we'll overwrite existing files
      }
      
      for (const playlistName of playlistNames) {
        const playlistData = aligned_db[playlistName];

        try {
          // Generate VOD JSON structure
          const vodJson = this.generateVODJson(playlistName, playlistData);
          
          console.log(`Sending VOD JSON for ${playlistName}:`, vodJson);
          
          // Send to VOD machine
          const response = await fetch(`${vodUrl}/api/vod-maps/${playlistName}.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
            },
            body: JSON.stringify(vodJson)
      });
          
      if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
          
      const result = await response.json();
          vodSuccessCount++;
          console.log(`✓ VOD: Saved ${playlistName}.json`, result);
    } catch (error) {
          vodFailCount++;
          vodErrors.push(`${playlistName}: ${error.message}`);
          console.error(`✗ VOD: Failed to save ${playlistName}.json:`, error);
        }
      }
      
      console.log(`VOD update complete: ${vodSuccessCount} success, ${vodFailCount} failed`);
      
      // Send POST request to playlist generate endpoint (via nginx proxy)
      try {
        console.log('Triggering playlist generation...');
        const generateResponse = await fetch('/api/playlist/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (generateResponse.ok) {
          console.log('✓ Playlist generation triggered successfully');
        } else {
          console.warn('⚠ Playlist generation endpoint returned error:', generateResponse.status);
        }
      } catch (generateError) {
        console.error('✗ Failed to trigger playlist generation:', generateError);
        // Continue anyway - don't block the success message
      }
      
      // Keyframe alignment summary — tells the operator which rows to re-save and which still
      // carry a manual shift that may now be double-correcting.
      let alignMsg = '';
      if (alignment.adjustments.length > 0) {
        const maxDelta = alignment.adjustments.reduce((m, a) => Math.abs(a.delta) > Math.abs(m) ? a.delta : m, 0);
        alignMsg += `\n\n⌁ Keyframe alignment: ${alignment.adjustments.length} in point(s) snapped (max ${maxDelta > 0 ? '+' : ''}${maxDelta}ms)`;
        alignMsg += `\n   Re-save those playlists to make the alignment permanent.`;
      }
      if (alignment.unavailable.length > 0) {
        alignMsg += `\n\n⚠ No keyframe data for ${alignment.unavailable.length} file(s) — exported as authored:\n   ${alignment.unavailable.slice(0, 3).join('\n   ')}`;
        if (alignment.unavailable.length > 3) alignMsg += `\n   ... and ${alignment.unavailable.length - 3} more`;
      }
      if (alignment.shiftWarnings.length > 0) {
        alignMsg += `\n\n⚠ Review manual A/V shift on ${alignment.shiftWarnings.length} snapped item(s):\n   ${alignment.shiftWarnings.slice(0, 3).join('\n   ')}`;
        if (alignment.shiftWarnings.length > 3) alignMsg += `\n   ... and ${alignment.shiftWarnings.length - 3} more`;
      }

      // Show combined results
      const totalSuccess = companionSuccessCount + vodSuccessCount;
      const totalFail = companionFailCount + vodFailCount;

      if (totalFail === 0) {
        alert(`✓ Successfully generated playlists!\n\nCompanion: ${companionSuccessCount} variables\nVOD: ${vodSuccessCount} JSON files${alignMsg}`);
      } else {
        let errorMsg = `Generated playlists with some errors:\n\n`;
        errorMsg += `✓ Companion: ${companionSuccessCount} success, ${companionFailCount} failed\n`;
        errorMsg += `✓ VOD: ${vodSuccessCount} success, ${vodFailCount} failed\n\n`;
        
        if (companionErrors.length > 0) {
          errorMsg += `Companion errors:\n${companionErrors.slice(0, 3).join('\n')}\n`;
          if (companionErrors.length > 3) errorMsg += `... and ${companionErrors.length - 3} more\n`;
        }
        
        if (vodErrors.length > 0) {
          errorMsg += `\nVOD errors:\n${vodErrors.slice(0, 3).join('\n')}`;
          if (vodErrors.length > 3) errorMsg += `\n... and ${vodErrors.length - 3} more`;
        }

        alert(errorMsg + alignMsg);
      }
    } catch (error) {
      alert(`Failed to generate playlists: ${error.message}`);
      console.error('Error generating playlists:', error);
    }
  }

  generateVODJson = (playlistName, playlistData) => {
    // Generate VOD JSON structure from playlist data
    const items = playlistData.playlist || [];
    const clips = [];
    const durations = [];
    
    // Iterate through each playlist item
    items.forEach(item => {
      const inpoints = Array.isArray(item.inpoint) ? item.inpoint : [];
      const outpoints = Array.isArray(item.outpoint) ? item.outpoint : [];
      
      // Each in/out pair becomes a clip
      for (let i = 0; i < inpoints.length; i++) {
        const inVal = inpoints[i];
        const outVal = outpoints[i];
        
        if (inVal !== null && inVal !== undefined && outVal !== null && outVal !== undefined) {
          // Create clip with wfapi prefix
          const clip = {
            type: "source",
            path: `wfapi/backup/files/sources/${item.file_path}`,
            clipFrom: inVal,  // in milliseconds
            shiftAudio: item.shiftAudio || 0,  // audio shift in milliseconds
            shiftVideo: item.shiftVideo || 0   // video shift in milliseconds
          };
          
          clips.push(clip);
          
          // Calculate duration (out - in) in milliseconds
          const duration = outVal - inVal;
          durations.push(duration);
        }
      }
    });
    
    // Build final VOD JSON structure
    const vodJson = {
      cache: false,
      durations: durations,
      sequences: [{
        clips: clips
      }]
    };
    
    return vodJson;
  };

  setPlaylistDate = (data) => {
    console.log(":: setPlaylistDate: ", data);
    let date = data.toLocaleDateString('sv');
    this.setState({playlistDate: data});
  };

  editPlaylist = (selected_playlist) => {
    console.log(":: editPlaylist: ", selected_playlist);
    this.setState({selected_playlist});
  };

  loadPlaylist = () => {
    const {selected_playlist, playlist_db} = this.state;
    const autoplay = playlist_db[selected_playlist]["autoplay"];
    const playlist = playlist_db[selected_playlist]["playlist"];
    const playlistDate = new Date(playlist_db[selected_playlist]["date"]);
    // Clear in/out/end_hafaka fields and skip time input
    this.setState({
      autoplay,
      playlist,
      playlistDate,
      playlist_name: selected_playlist,
      inpoint: [],
      outpoint: [],
      end_hafaka: null,
      sadnaInOuts: [],
      currentSadnaIndex: null,
      currentInOutIndex: null,
      snapInfo: {},
      forwardSkipValue: ""
    });

    // Auto-load the first item for editing if playlist has items
    if (playlist && playlist.length > 0) {
      console.log('Auto-loading first playlist item for editing');
      this.loadPlaylistItemToPlayer(playlist[0], 0);
    }
  };

  removePlaylist = () => {
    const {selected_playlist, playlist_db} = this.state;
    removeData(`shidur/playlist/${selected_playlist}`, data => {
      console.log(":: Remove playlist: ", data);
      delete playlist_db[selected_playlist];
      this.setState({playlist_db, playlist: [], selected_playlist: ""});
    })
  }

  skipTime = (seconds) => {
    const video = this.playerRef.current;
    if (video && !isNaN(video.currentTime)) {
      const newTime = video.currentTime + seconds;
      if (newTime >= 0 && newTime <= video.duration) {
        try {
          // Set the new time
          video.currentTime = newTime;
          console.log(`Skipped ${seconds} seconds to ${newTime}s`);
        } catch (error) {
          console.log('Error during skip operation:', error);
        }
      }
    }
  }

  // Parse time input like "90", "1:30", or "01:02:03" into seconds (number)
  parseTimeInputToSeconds = (input) => {
    if (input === null || input === undefined) return NaN;
    const value = String(input).trim();
    if (value.length === 0) return NaN;
    if (!value.includes(':')) {
      const s = Number(value);
      return isNaN(s) ? NaN : s;
    }
    const parts = value.split(':').map(p => Number(p));
    if (parts.some(isNaN)) return NaN;
    // Support mm:ss or hh:mm:ss
    let seconds = 0;
    if (parts.length === 2) {
      const [mm, ss] = parts;
      seconds = (mm * 60) + ss;
    } else if (parts.length === 3) {
      const [hh, mm, ss] = parts;
      seconds = (hh * 3600) + (mm * 60) + ss;
    } else {
      return NaN;
    }
    return seconds;
  }

  // Custom forward skip using the mm:ss field
  skipForwardCustom = () => {
    const seconds = this.parseTimeInputToSeconds(this.state.forwardSkipValue);
    if (isNaN(seconds)) return;
    this.skipTime(seconds);
  }

  // Helper function to calculate clip duration from in point to end_hafaka
  calculateClipDuration = (inpoint, end_hafaka) => {
    if (inpoint === null || inpoint === undefined) return 0;
    if (end_hafaka === null || end_hafaka === undefined) return 0;
    return end_hafaka - inpoint;
  }

  // Helper function to format time in HH:MM:SS format
  // withMs matters for in points: they are keyframe-aligned and therefore rarely land on a
  // whole second, and truncating would hide exactly what the operator needs to see.
  formatTime = (milliseconds, withMs = false) => {
    if (!milliseconds || milliseconds < 0) return withMs ? '00:00:00.000' : '00:00:00';
    // Convert milliseconds to seconds first
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const hms = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return withMs ? `${hms}.${Math.floor(milliseconds % 1000).toString().padStart(3, '0')}` : hms;
  }

  // Badge showing whether an in point sits on a video keyframe. 'stale' is what every playlist
  // saved before keyframe snapping will show until it is re-saved.
  renderSnapBadge = (index) => {
    const info = this.state.snapInfo[index];
    if (!info) return null;
    const base = {fontSize: '9px', padding: '2px 4px', borderRadius: '3px', whiteSpace: 'nowrap'};
    if (info.status === 'pending') return <span style={{...base, background: '#eee', color: '#888'}} title="Loading keyframe index…">KF…</span>;
    if (info.status === 'unavailable') return <span style={{...base, background: '#eee', color: '#888'}} title="No keyframe data for this file — in point exported as authored">KF?</span>;
    if (info.status === 'stale') {
      return <span style={{...base, background: '#ffebee', color: '#c62828'}}
                   title="Saved in point is not on a keyframe — press Save to align it">
        off-KF {info.delta > 0 ? '+' : ''}{info.delta}ms
      </span>;
    }
    if (info.delta === 0) return <span style={{...base, background: '#e8f5e9', color: '#2e7d32'}} title="On a video keyframe — audio and video will be in sync">KF ✓</span>;
    return <span style={{...base, background: '#fff8e1', color: '#ef6c00'}} title="Moved back to the nearest earlier video keyframe">KF {info.delta > 0 ? '+' : ''}{info.delta}ms</span>;
  }

  // Function to jump player to specific time
  jumpPoint = (timeInMilliseconds) => {
    // 0 is a legitimate target — it is the first keyframe.
    if (timeInMilliseconds === null || timeInMilliseconds === undefined || !this.playerRef.current) return;
    
    // Convert milliseconds to seconds for the video player
    const timeInSeconds = timeInMilliseconds / 1000;
    
    try {
      // Set the player's current time
      this.playerRef.current.currentTime = timeInSeconds;
      console.log(`Jumped to time: ${this.formatTime(timeInMilliseconds)} (${timeInSeconds}s)`);
    } catch (error) {
      console.log('Error during jump operation:', error);
    }
  }

  // Function to jump to the end of the video
  jumpToEnd = () => {
    const video = this.playerRef.current;
    if (!video || !video.duration) return;
    
    try {
      // Jump to the last rounded whole second (avoid exact end when duration is integer)
      let lastSec = Math.floor(video.duration);
      if (Math.abs(lastSec - video.duration) < 1e-6) {
        lastSec = Math.max(0, lastSec - 1);
      }
      video.currentTime = lastSec;
      
      console.log(`Jumped to end rounded second: ${lastSec}s`);
    } catch (error) {
      console.log('Error during jump to end operation:', error);
    }
  }

  // Load a playlist item onto the player for editing
  loadPlaylistItemToPlayer = (playlistItem, index = null) => {
    console.log('Loading playlist item to player:', playlistItem);
    
    // Get shift values from playlist item
    const itemShiftAudio = playlistItem.shiftAudio || 0;
    const itemShiftVideo = playlistItem.shiftVideo || 0;
    
    // Build shift path segment if needed: /shift/a{audio}/v{video}/
    let shiftSegment = '';
    if (itemShiftAudio !== 0 || itemShiftVideo !== 0) {
      shiftSegment = '/shift';
      if (itemShiftAudio !== 0) shiftSegment += `/a${itemShiftAudio}`;
      if (itemShiftVideo !== 0) shiftSegment += `/v${itemShiftVideo}`;
    }
    
    // Always load the full file for editing (not the trimmed version)
    let fullHlsPath = `https://src.bbdomain.org/${playlistItem.file_path}${shiftSegment}/master.m3u8`;
    
    // Set the HLS source to the full file
    if (this.state.hls) {
      this.state.hls.loadSource(fullHlsPath);
      console.log('Loaded full file for editing with shift:', fullHlsPath);
    }
    
    // Create file_data object from playlist item so IN/OUT controls are visible
    const file_data = {
      source_id: playlistItem.source_id,
      sha1: playlistItem.sha1,
      file_name: playlistItem.file_name,
      source: {
        converted: {
          filename: `/backup/files/sources/${playlistItem.file_path}`,
          file_uid: playlistItem.file_uid,
          duration: playlistItem.duration
        }
      }
    };
    
    // Set the in/out points from the playlist item and file_data (ensure arrays)
    const loadedInpoints = Array.isArray(playlistItem.inpoint) ? [...playlistItem.inpoint] : (playlistItem.inpoint !== null && playlistItem.inpoint !== undefined ? [playlistItem.inpoint] : []);
    const loadedOutpoints = Array.isArray(playlistItem.outpoint) ? [...playlistItem.outpoint] : (playlistItem.outpoint !== null && playlistItem.outpoint !== undefined ? [playlistItem.outpoint] : []);
    
    this.setState({
      inpoint: loadedInpoints,
      outpoint: loadedOutpoints,
      end_hafaka: playlistItem.end_hafaka || null,
      sadnaInOuts: playlistItem.sadnaInOuts ? [...playlistItem.sadnaInOuts] : [],
      currentSadnaIndex: null,
      currentInOutIndex: null,
      editingPlaylistIndex: index !== null ? index : this.state.editingPlaylistIndex,
      file_data: file_data,
      file_name: playlistItem.file_name,
      hasUnsavedChanges: false,
      shiftAudio: playlistItem.shiftAudio || 0,
      shiftVideo: playlistItem.shiftVideo || 0,
      snapInfo: {}
    });

    // Flags in points saved before keyframe snapping existed, so they show up as 'off-KF'.
    this.loadKeyframesFor(playlistItem.file_path, playlistItem.duration);

    console.log('Set in/out points:', { inpoint: loadedInpoints, outpoint: loadedOutpoints, end_hafaka: playlistItem.end_hafaka });
    console.log('Set sadna pairs:', playlistItem.sadnaInOuts);
    console.log('Set file_data for editing:', file_data);
  }

  // Edit a playlist item
  editPlaylistItem = (index) => {
    console.log('Editing playlist item at index:', index);
    const playlistItem = this.state.playlist[index];
    this.loadPlaylistItemToPlayer(playlistItem, index);
  }

  // Update the currently loaded playlist item with new in/out points
  updateCurrentPlaylistItem = () => {
    const { editingPlaylistIndex, inpoint, outpoint, end_hafaka, playlist } = this.state;
    
    if (editingPlaylistIndex === null || editingPlaylistIndex === undefined) {
      console.log('No item selected for editing');
      return;
    }
    
    console.log('Updating playlist item at index:', editingPlaylistIndex, { inpoint, outpoint, end_hafaka });
    
    // Ensure inpoint is 0 if we have out/end_hafaka and missing in
    let finalInpoint = (inpoint === null || inpoint === undefined) && (outpoint !== null && outpoint !== undefined || end_hafaka !== null && end_hafaka !== undefined) ? 0 : inpoint;
    
    const updatedPlaylist = [...playlist];
    updatedPlaylist[editingPlaylistIndex] = {
      ...updatedPlaylist[editingPlaylistIndex],
      inpoint: finalInpoint,
      outpoint,
      end_hafaka
    };
    
    // Update HLS path if in/out are set, allowing 0
    if ((finalInpoint !== null && finalInpoint !== undefined) && (outpoint !== null && outpoint !== undefined)) {
      const { file_path, shiftAudio, shiftVideo } = updatedPlaylist[editingPlaylistIndex];
      
      // Build shift path segment if needed: /shift/a{audio}/v{video}/
      let shiftSegment = '';
      if (shiftAudio !== 0 || shiftVideo !== 0) {
        shiftSegment = '/shift';
        if (shiftAudio && shiftAudio !== 0) shiftSegment += `/a${shiftAudio}`;
        if (shiftVideo && shiftVideo !== 0) shiftSegment += `/v${shiftVideo}`;
      }
      
      let hls_path = `https://src.bbdomain.org/${file_path}/clipFrom/${finalInpoint}/clipTo/${outpoint}${shiftSegment}/master.m3u8`;
      updatedPlaylist[editingPlaylistIndex].hls_path = hls_path;
    }
    
    this.setState({ playlist: updatedPlaylist });
    console.log('Updated playlist:', updatedPlaylist);
  }





  // Remove item from playlist
  removeFromPlaylist = (index) => {
    const { playlist, editingPlaylistIndex } = this.state;
    
    console.log('Removing playlist item at index:', index);
    
    // Remove the item
    const updatedPlaylist = playlist.filter((_, i) => i !== index);
    
    // Update editing index if needed
    let newEditingIndex = editingPlaylistIndex;
    if (editingPlaylistIndex === index) {
      // If we're removing the currently edited item, clear editing state
      newEditingIndex = null;
      this.setState({ inpoint: null, outpoint: null });
    } else if (editingPlaylistIndex > index) {
      // If we're removing an item before the edited one, adjust the index
      newEditingIndex = editingPlaylistIndex - 1;
    }
    
    this.setState({ 
      playlist: updatedPlaylist, 
      editingPlaylistIndex: newEditingIndex,
      hasUnsavedChanges: true
    });
    
    console.log('Updated playlist after removal:', updatedPlaylist);
  }

  // Toggle settings popup
  toggleSettings = () => {
    this.setState(prevState => ({ showSettings: !prevState.showSettings }));
  }

  render() {
    try {
      const {isHls, inpoint, outpoint, end_hafaka, find_uid, autoplay, selected_playlist, playlist_db, playlist_name, file_data, lang_options, video_options, selected_lang, files, selected_video, playlist, playlistDate, editingPlaylistIndex, showSettings, sadnaInOuts, currentSadnaIndex, currentInOutIndex, shiftAudio, shiftVideo, keyframeStatus, keyframeCount} = this.state;

    let files_list = (files || []).map((data, i) => {
      if (!data || !data.source_id || !data.file_name) return null;
      return ({ key: data.source_id, text: data.file_name, value: data.source_id })
    }).filter(Boolean);

    const list = (playlist || []).map((data, i) => {
      if (!data) return null;
      const {source_id, file_name, uid, duration, inpoint, outpoint, end_hafaka, sadnaInOuts, shiftAudio, shiftVideo} = data;
      
      // live values while editing (now arrays)
      const liveInArray = (editingPlaylistIndex === i) ? this.state.inpoint : (Array.isArray(inpoint) ? inpoint : []);
      const liveOutArray = (editingPlaylistIndex === i) ? this.state.outpoint : (Array.isArray(outpoint) ? outpoint : []);
      const liveEnd = (editingPlaylistIndex === i && (this.state.end_hafaka || this.state.end_hafaka === 0)) ? this.state.end_hafaka : end_hafaka;
      const liveSadna = (editingPlaylistIndex === i) ? this.state.sadnaInOuts : (sadnaInOuts || []);
      
      // Use first in/out pair for display
      const liveIn = liveInArray.length > 0 ? liveInArray[0] : null;
      const liveOut = liveOutArray.length > 0 ? liveOutArray[0] : null;
      const clipDuration = this.calculateClipDuration(liveIn, liveEnd);
      
      return (
        <Table.Row 
          key={i} 
          className={editingPlaylistIndex === i ? 'editing-row' : ''}
        >
          <Table.Cell>{source_id}</Table.Cell>
          <Table.Cell>{file_name}</Table.Cell>
          <Table.Cell className="time-column">
            {liveInArray.length > 0 && liveIn !== null ? this.formatTime(liveIn) : '00:00:00'}
            {liveInArray.length > 1 && <span style={{fontSize: '10px', color: '#666'}}> (+{liveInArray.length - 1})</span>}
          </Table.Cell>
          <Table.Cell className="time-column">{(liveEnd || liveEnd === 0) ? this.formatTime(liveEnd) : '00:00:00'}</Table.Cell>
          <Table.Cell className="time-column">
            {liveOutArray.length > 0 && liveOut !== null ? this.formatTime(liveOut) : '00:00:00'}
            {liveOutArray.length > 1 && <span style={{fontSize: '10px', color: '#666'}}> (+{liveOutArray.length - 1})</span>}
          </Table.Cell>
          <Table.Cell className="time-column clip-duration">{this.formatTime(clipDuration)}</Table.Cell>
          <Table.Cell>{toHms(duration)}</Table.Cell>
          <Table.Cell>{uid}</Table.Cell>
          <Table.Cell style={{ textAlign: 'center' }}>
            <Label size="small" color={liveSadna.length > 0 ? 'blue' : undefined}>
              {liveSadna.length}
            </Label>
          </Table.Cell>
          <Table.Cell style={{ textAlign: 'center', fontSize: '11px' }}>{shiftAudio || 0}</Table.Cell>
          <Table.Cell style={{ textAlign: 'center', fontSize: '11px' }}>{shiftVideo || 0}</Table.Cell>
          <Table.Cell className="actions-cell">
            <div style={{ display: 'flex', gap: '4px' }}>
              <Button 
                size="mini" 
                negative 
                onClick={() => this.removeFromPlaylist(i)}
              >
                Remove
              </Button>
            </div>
          </Table.Cell>
        </Table.Row>
      )
    }).filter(Boolean);

    const playlist_options = Object.keys(playlist_db || {}).map((k) => {
      if (!k) return null;
      return ({key: k, text: k, value: k})
    }).filter(Boolean)

    const src_options = [
      { key: 1, text: 'Workflow', value: 'Workflow' },
      { key: 2, text: 'Backup', value: 'Backup' },
    ];

    const hasUnsaved = this.state.hasUnsavedChanges;
    const allHaveEndHafaka = (playlist || []).length > 0 && (playlist || []).every((r, idx) => {
      if (!r) return false;
      const liveEnd = (editingPlaylistIndex === idx) ? end_hafaka : r.end_hafaka;
      return liveEnd !== null && liveEnd !== undefined;
    });

    return(
      <Segment textAlign='center' >

        <Grid>
          <GridRow columns={2} divided stackable="true">
            <GridColumn stretched>
              <Segment style={{ padding: '8px' }}>
                <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto', position: 'relative' }}>
                  {/* Settings Icon */}
                  <Button
                    size="mini"
                    circular
                    className="settings-button"
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      zIndex: 10,
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      color: 'white',
                      border: 'none',
                      minWidth: '32px',
                      height: '32px'
                    }}
                    onClick={this.toggleSettings}
                  >
                    ⚙️
                  </Button>
                  
                                     <video
                     ref={this.playerRef}
                      width="100%"
                      height="auto"
                      style={{ maxWidth: '100%', height: 'auto' }}
                      // autoPlay
                      controls
                      playsInline={true}
                   />
                  
                  {/* Skip Controls */}
                  <div className="skip-controls" style={{ margin: '8px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
                      <Button onClick={() => this.skipTime(-300)} size="small">-5m</Button>
                      <Button onClick={() => this.skipTime(-60)} size="small">-1m</Button>
                      <Button onClick={() => this.skipTime(-10)} size="small">-10s</Button>
                      <Button onClick={() => this.skipTime(-1)} size="small">-1s</Button>
                      <Button onClick={() => this.skipTime(1)} size="small">+1s</Button>
                      <Button onClick={() => this.skipTime(10)} size="small">+10s</Button>
                      <Button onClick={() => this.skipTime(60)} size="small">+1m</Button>
                      <Button onClick={() => this.skipTime(300)} size="small">+5m</Button>
                      <Button onClick={() => this.jumpToEnd()} size="small" color="blue">End</Button>
                    </div>
                    {/* Keyframe stepping - park the playhead on a cut point before pressing IN */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                      <Button onClick={() => this.skipToKeyframe(-1)} size="small" color="teal"
                              disabled={keyframeStatus !== 'ok'} title="Jump to previous keyframe">⏮ KF</Button>
                      <Button onClick={() => this.skipToKeyframe(1)} size="small" color="teal"
                              disabled={keyframeStatus !== 'ok'} title="Jump to next keyframe">KF ⏭</Button>
                      <span style={{ fontSize: '11px', color: '#888', marginLeft: '6px' }}>
                        {keyframeStatus === 'ok' ? `${keyframeCount} keyframes`
                          : keyframeStatus === 'loading' ? 'keyframes loading…'
                          : keyframeStatus === 'unavailable' ? 'keyframes unavailable' : ''}
                      </span>
                    </div>
                    {/* Custom forward skip - keeps existing controls unchanged */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                      <Input
                        size="small"
                        style={{ width: '140px' }}
                        placeholder="Custom + (mm:ss or ss)"
                        value={this.state.forwardSkipValue}
                        onChange={(e) => this.setState({ forwardSkipValue: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') this.skipForwardCustom(); }}
                      />
                      <Button size="small" onClick={this.skipForwardCustom}>+ Skip</Button>
                    </div>
                  </div>

                                    {/* IN/OUT Controls - Multiple pairs support */}
                  {file_data && (
                    <div style={{ margin: '12px 0', padding: '8px', textAlign: 'center', backgroundColor: '#f0f8ff', borderRadius: '4px', border: '1px solid #b0d4f1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '14px' }}>In/Out Points:</strong>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <Button size="tiny" color="blue" onClick={this.addInOutPair}>➕ Add Pair</Button>
                          <Button size="tiny" color="red" onClick={this.clearInOutPairs} disabled={inpoint.length === 0}>Clear All</Button>
                        </div>
                      </div>
                      
                      <div style={{ marginBottom: '8px' }}>
                        <Button as='div' labelPosition='left'>
                          <Label as='a' basic pointing='right' color='green'
                                 onClick={() => this.jumpPoint(end_hafaka)} style={{ cursor: end_hafaka ? 'pointer' : 'default' }}>
                            {end_hafaka ? this.formatTime(end_hafaka) : "Set end hafaka ->"}
                          </Label>
                          <Button icon color='green' size='small' onClick={() => this.setEndHafaka()}/>
                        </Button>
                      </div>
                      
                      {inpoint.length === 0 ? (
                        <div style={{ padding: '8px', color: '#888', fontSize: '12px' }}>
                          No in/out pairs yet. Click "Add Pair" to create one.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                          {inpoint.map((inVal, index) => {
                            const outVal = outpoint[index];
                            return (
                              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px', backgroundColor: currentInOutIndex === index ? '#e3f2fd' : 'white', borderRadius: '4px', border: '1px solid #ddd' }}>
                                <span style={{ minWidth: '20px', fontWeight: 'bold', fontSize: '12px' }}>{index + 1}.</span>
                                
                                <Button as='div' labelPosition='right' size='mini'>
                                  <Button icon color='blue' size='mini' onClick={() => this.setIn(index)} />
                                  <Label as='a' basic pointing='left' onClick={() => inVal !== null && this.jumpPoint(inVal)}
                                         style={{ cursor: inVal !== null ? 'pointer' : 'default', fontSize: '11px', minWidth: '88px' }}>
                                    {inVal !== null && inVal !== undefined ? this.formatTime(inVal, true) : "Set in"}
                          </Label>
                        </Button>

                                {/* Step the in point to the adjacent keyframe */}
                                <Button.Group size='mini'>
                                  <Button icon size='mini' compact title="Previous keyframe"
                                          disabled={keyframeStatus !== 'ok' || inVal === null || inVal === undefined}
                                          onClick={() => this.nudgeIn(index, -1)}>◀</Button>
                                  <Button icon size='mini' compact title="Next keyframe"
                                          disabled={keyframeStatus !== 'ok' || inVal === null || inVal === undefined}
                                          onClick={() => this.nudgeIn(index, 1)}>▶</Button>
                                </Button.Group>
                                {this.renderSnapBadge(index)}

                                <Button as='div' labelPosition='left' size='mini'>
                                  <Label as='a' basic pointing='right' onClick={() => outVal !== null && this.jumpPoint(outVal)} 
                                         style={{ cursor: outVal !== null ? 'pointer' : 'default', fontSize: '11px', minWidth: '70px' }}>
                                    {outVal !== null ? this.formatTime(outVal) : "Set out"}
                                  </Label>
                                  <Button icon color='blue' size='mini' onClick={() => this.setOut(index)} />
                                </Button>
                                
                                <Button icon size='mini' color='red' onClick={() => this.removeInOutPair(index)} title="Remove this pair">
                                  ✕
                                </Button>
                      </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sadna In/Out Controls */}
                  {file_data && (
                    <div style={{ margin: '12px 0', padding: '8px', textAlign: 'center', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '14px' }}>Sadna In/Outs:</strong>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <Button size="tiny" color="green" onClick={this.addSadnaPair}>➕ Add Pair</Button>
                          <Button size="tiny" color="red" onClick={this.clearSadnaInOuts} disabled={sadnaInOuts.length === 0}>Clear All</Button>
                        </div>
                      </div>
                      
                      {sadnaInOuts.length === 0 ? (
                        <div style={{ padding: '8px', color: '#888', fontSize: '12px' }}>
                          No sadna pairs yet. Click "Add Pair" to create one.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                          {sadnaInOuts.map((pair, index) => (
                            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px', backgroundColor: currentSadnaIndex === index ? '#e3f2fd' : 'white', borderRadius: '4px', border: '1px solid #ddd' }}>
                              <span style={{ minWidth: '20px', fontWeight: 'bold', fontSize: '12px' }}>{index + 1}.</span>
                              
                              <Button as='div' labelPosition='right' size='mini'>
                                <Button icon color='blue' size='mini' onClick={() => this.setSadnaIn(index)} />
                                <Label as='a' basic pointing='left' onClick={() => pair.in !== null && this.jumpPoint(pair.in)} 
                                       style={{ cursor: pair.in !== null ? 'pointer' : 'default', fontSize: '11px', minWidth: '70px' }}>
                                  {pair.in !== null ? this.formatTime(pair.in) : "Set in"}
                                </Label>
                              </Button>
                              
                              <Button as='div' labelPosition='left' size='mini'>
                                <Label as='a' basic pointing='right' onClick={() => pair.out !== null && this.jumpPoint(pair.out)} 
                                       style={{ cursor: pair.out !== null ? 'pointer' : 'default', fontSize: '11px', minWidth: '70px' }}>
                                  {pair.out !== null ? this.formatTime(pair.out) : "Set out"}
                                </Label>
                                <Button icon color='blue' size='mini' onClick={() => this.setSadnaOut(index)} />
                              </Button>
                              
                              <Button icon size='mini' color='red' onClick={() => this.removeSadnaPair(index)} title="Remove this pair">
                                ✕
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Shift Audio/Video Controls */}
                  {file_data && (
                    <div style={{ margin: '12px 0', padding: '8px', textAlign: 'center', backgroundColor: '#f0f8ff', borderRadius: '4px', border: '1px solid #b0d4f1' }}>
                      <strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>Audio/Video Shift (ms):</strong>
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Audio:</label>
                          <Input
                            type="number"
                            value={shiftAudio}
                            onChange={(e) => this.setState({ shiftAudio: parseInt(e.target.value) || 0 })}
                            size="mini"
                            style={{ width: '80px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Video:</label>
                          <Input
                            type="number"
                            value={shiftVideo}
                            onChange={(e) => this.setState({ shiftVideo: parseInt(e.target.value) || 0 })}
                            size="mini"
                            style={{ width: '80px' }}
                          />
                        </div>
                        <Button 
                          size="mini" 
                          color="blue" 
                          onClick={() => {
                            const {hls, file_data, shiftAudio, shiftVideo} = this.state;
                            if (file_data && hls) {
                              const path = file_data.source.converted.filename.split('/backup/files/sources/')[1];
                              
                              // Build shift path segment: /shift/a{audio}/v{video}/
                              let shiftSegment = '';
                              if (shiftAudio !== 0 || shiftVideo !== 0) {
                                shiftSegment = '/shift';
                                if (shiftAudio !== 0) shiftSegment += `/a${shiftAudio}`;
                                if (shiftVideo !== 0) shiftSegment += `/v${shiftVideo}`;
                              }
                              
                              let hls_source = `https://src.bbdomain.org/${path}${shiftSegment}/master.m3u8`;
                              
                              hls.loadSource(hls_source);
                              this.setState({hls_source});
                              console.log('Reloaded with shift:', hls_source);
                            }
                          }}
                          disabled={!file_data}
                        >
                          🔄 Apply Shift
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Add to Playlist Button - Always visible when file is loaded, but disabled when editing */}
                  {file_data && (
                    <div style={{ margin: '8px 0', padding: '4px', textAlign: 'center' }}>
                      <Button
                        secondary
                        size="small"
                        onClick={this.addToPlaylist}
                        disabled={!file_data || (editingPlaylistIndex !== null && editingPlaylistIndex !== undefined)}
                      >
                        ➕ Add to Playlist
                      </Button>
                    </div>
                  )}

                  {/* Editing Controls */}
                  {null}
                </div>

              </Segment>
            </GridColumn>
            <GridColumn>
              <Segment style={{ padding: '8px' }}>
                <Table basic='very' unstackable>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell/>
                      <Table.HeaderCell/>
                      <Table.HeaderCell/>
                      <Table.HeaderCell />
                      <Table.HeaderCell />
                      <Table.HeaderCell />
                    </Table.Row>
                  </Table.Header>

                  <Table.Body>
                    <Table.Row>
                      <Table.Cell>Date</Table.Cell>
                      <Table.Cell>
                        <DatePicker
                          className="datepickercs"
                          dateFormat="yyyy-MM-dd"
                          // locale={he}
                          showYearDropdown
                          showMonthDropdown
                          scrollableYearDropdown
                          maxDate={new Date()}
                          selected={this.state.startDate}
                          onChange={this.changeDate}
                        />
                      </Table.Cell>
                      <Table.Cell>UID</Table.Cell>
                      <Table.Cell>
                        <Input
                          action
                          placeholder='36SHmz3G'
                          value={find_uid}
                          onChange={(e, { value }) => this.setState({find_uid: value})}
                        ><input /><Button onClick={() => this.findByUID()} size="small">Find</Button></Input>
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell>Files</Table.Cell>
                      <Table.Cell colSpan='5'>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Dropdown
                            // disabled={!id}
                            fluid
                            // className="trim_files_dropdown"
                            selectOnBlur={false}
                            selectOnNavigation={false}
                            error={this.state.disabled}
                            scrolling={false}
                            className="files-dropdown-up"
                            placeholder="Select File To Play:"
                            selection
                            value={file_data?.source_id || ''}
                            options={files_list}
                            onChange={(e,{value}) => this.selectFile(value)}
                            // onClick={() => this.getWorkflow(this.state.date)}
                          >
                          </Dropdown>
                          {file_data && (
                            <div className="file-info-popup" style={{ position: 'relative' }}>
                              <span style={{ cursor: 'pointer', fontSize: '16px', color: '#666' }}>ℹ️</span>
                              <div className="file-info-content" style={{ 
                                position: 'absolute', 
                                bottom: '100%', 
                                left: '50%', 
                                transform: 'translateX(-50%)', 
                                backgroundColor: 'white', 
                                border: '1px solid #ccc', 
                                borderRadius: '8px', 
                                padding: '12px', 
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
                                zIndex: 1000, 
                                minWidth: '300px',
                                display: 'none'
                              }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>File Information</div>
                                <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                                  <div><strong>Content UID:</strong> <a target="_blank" rel="noopener noreferrer" href={`${MDB_UNIT_URL}/${file_data?.line?.unit_id}`}>{file_data?.line?.uid}</a></div>
                                  <div><strong>Source File UID:</strong> {file_data?.source?.converted?.file_uid}</div>
                                  <div><strong>Source SHA1:</strong> {file_data?.sha1}</div>
                                  <div><strong>Kmedia File UID:</strong> {file_data?.source?.kmedia?.file_uid}</div>
                                  <div><strong>Kmedia SHA1:</strong> {file_data?.source?.kmedia?.sha1}</div>
                                  <div><strong>Duration:</strong> {toHms(file_data?.source?.kmedia?.duration || "")}</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell>HLS</Table.Cell>
                      <Table.Cell>
                        <Checkbox toggle checked={isHls} onChange={() => this.setState({isHls: !isHls})} />
                      </Table.Cell>
                    </Table.Row>
                  </Table.Body>
                </Table>
              </Segment>

              {/* Playlist Management - Compact and under IN/OUT controls */}
              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                  {/* Top Section - Load playlist controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px', width: '100%', justifyContent: 'center' }}>
                    <Button disabled={!selected_playlist} onClick={this.loadPlaylist} size="small">Load playlist</Button>
                    <Dropdown
                      // disabled={!id}
                      compact
                      className="playlist-dropdown-up"
                      selection
                      scrolling
                      options={playlist_options}
                      value={selected_playlist}
                      onChange={(e, {value}) => this.editPlaylist(value)}
                      style={{ minWidth: '200px', position: 'relative' }}
                    >
                    </Dropdown>
                    <Button negative disabled={!selected_playlist} onClick={this.removePlaylist} size="small">Remove playlist</Button>
                    <Button onClick={this.generatePlaylist} size="small" color="green">Generate Playlists</Button>

                  </div>
                  
                  {/* Separator line */}
                  <div style={{ width: '100%', height: '1px', backgroundColor: '#dee2e6' }}></div>
                  
                  {/* Bottom Section - Save playlist controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', width: '100%', justifyContent: 'center' }}>
                    <Button disabled={!allHaveEndHafaka} onClick={this.savePlaylist} size="small" color={hasUnsaved ? 'orange' : undefined}>Save playlist</Button>
                    <Input value={playlist_name} placeholder='Playlist name' size="small" style={{ minWidth: '200px' }} onChange={(e) => {this.setState({playlist_name: e.target.value})}} />
                    <div style={{ padding: '2px 6px', backgroundColor: '#ffffff', border: '1px solid #dee2e6', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#666' }}>
                     Total: {toHms((playlist || []).map((r, idx) => {
                       if (!r) return 0;
                       const liveInArray = (editingPlaylistIndex === idx) ? inpoint : (Array.isArray(r.inpoint) ? r.inpoint : []);
                       const liveEnd = (editingPlaylistIndex === idx && (end_hafaka || end_hafaka === 0)) ? end_hafaka : r.end_hafaka;
                       const firstIn = liveInArray.length > 0 ? liveInArray[0] : null;
                       if (firstIn !== null && firstIn !== undefined && liveEnd !== null && liveEnd !== undefined) {
                         return (liveEnd - firstIn) / 1000;
                       }
                       return Number(r.duration) || 0;
                   }).reduce((su, cur) => su + cur, 0))}
                  
                   </div>
                  </div>
                </div>
              </div>

            </GridColumn>
          </GridRow>

          <GridRow>
            <GridColumn>
              <Table unstackable className="playlist-table">
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>ID</Table.HeaderCell>
                    <Table.HeaderCell>File Name</Table.HeaderCell>
                    <Table.HeaderCell>In Point</Table.HeaderCell>
                    <Table.HeaderCell>End Hafaka</Table.HeaderCell>
                    <Table.HeaderCell>Out Point</Table.HeaderCell>
                    <Table.HeaderCell>Clip Duration</Table.HeaderCell>
                    <Table.HeaderCell>File Duration</Table.HeaderCell>
                    <Table.HeaderCell>Content UID</Table.HeaderCell>
                    <Table.HeaderCell>Sadna Pairs</Table.HeaderCell>
                    <Table.HeaderCell>Shift Audio (ms)</Table.HeaderCell>
                    <Table.HeaderCell>Shift Video (ms)</Table.HeaderCell>
                    <Table.HeaderCell>Actions</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>

                <Table.Body>
                  {list}
                </Table.Body>
                {/*<Table.Footer>*/}
                {/*  <Table.Row>*/}
                {/*    <Table.HeaderCell><Button onClick={this.savePlaylist}>Save playlist</Button></Table.HeaderCell>*/}
                {/*    <Table.HeaderCell><Input value={playlist_name} placeholder='Playlist name' onChange={(e) => {this.setState({playlist_name: e.target.value})}} /></Table.HeaderCell>*/}
                {/*    <Table.HeaderCell>*/}
                {/*      <DatePicker*/}
                {/*        className="datepickercs"*/}
                {/*        dateFormat="yyyy-MM-dd"*/}
                {/*        // locale={he}*/}
                {/*        showYearDropdown*/}
                {/*        showMonthDropdown*/}
                {/*        scrollableYearDropdown*/}
                {/*        maxDate={new Date()}*/}
                {/*        selected={playlistDate}*/}
                {/*        onChange={this.setPlaylistDate}*/}
                {/*      />*/}
                {/*    </Table.HeaderCell>*/}
                {/*    <Table.HeaderCell>Total:</Table.HeaderCell>*/}
                {/*    <Table.HeaderCell>{toHms(playlist.map((r) => Number(r?.duration)).reduce((su, cur) => su + cur, 0))}</Table.HeaderCell>*/}
                {/*  </Table.Row>*/}
                {/*</Table.Footer>*/}
              </Table>
            </GridColumn>
          </GridRow>
        </Grid>

        {/* Custom CSS for upward dropdown */}
        <style>
          {`
            .playlist-dropdown-up .ui.selection.dropdown .menu,
            .files-dropdown-up .ui.selection.dropdown .menu {
              top: auto !important;
              bottom: 100% !important;
              margin-bottom: 0.5em !important;
              max-height: 200px !important;
              overflow-y: auto !important;
              z-index: 9999 !important;
            }
            .playlist-dropdown-up .ui.selection.dropdown .menu:before,
            .files-dropdown-up .ui.selection.dropdown .menu:before {
              top: auto !important;
              bottom: -0.5em !important;
              border-top: 0.5em solid #fff !important;
              border-bottom: none !important;
            }
            .playlist-dropdown-up .ui.selection.dropdown .menu:after,
            .files-dropdown-up .ui.selection.dropdown .menu:after {
              top: auto !important;
              bottom: -0.5em !important;
              border-top: 0.5em solid #fff !important;
              border-bottom: none !important;
            }
            .playlist-dropdown-up .ui.selection.dropdown,
            .files-dropdown-up .ui.selection.dropdown {
              position: relative !important;
              z-index: 9999 !important;
            }
          `}
        </style>

        {/* Settings Modal */}
        {showSettings && (
          <div 
            className="settings-modal-overlay"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={this.toggleSettings}
          >
            <div 
              className="settings-modal-content"
              style={{
                backgroundColor: 'white',
                padding: '24px',
                borderRadius: '8px',
                minWidth: '400px',
                maxWidth: '500px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="settings-modal-header">
                <h3>⚙️ Player Settings</h3>
                <Button 
                  size="mini" 
                  circular 
                  onClick={this.toggleSettings}
                  style={{ margin: 0, minWidth: '32px', height: '32px' }}
                >
                  ✕
                </Button>
              </div>

              <div className="settings-modal-section">
                <Dropdown
                  fluid
                  selection
                  options={lang_options}
                  value={selected_lang}
                  onChange={(e, {value}) => this.setLang(value)}
                  placeholder="Select language"
                />
              </div>

              <div className="settings-modal-section">
                <Dropdown
                  fluid
                  selection
                  options={video_options}
                  value={selected_video}
                  onChange={(e, {value}) => this.setVideo(value)}
                  placeholder="Select video quality"
                />
              </div>

              <div className="settings-modal-footer">
                <Button 
                  basic 
                  onClick={this.toggleSettings}
                >
                  Cancel
                </Button>
                <Button 
                  primary 
                  onClick={this.toggleSettings}
                >
                  Save Settings
                </Button>
              </div>
            </div>
          </div>
        )}
      </Segment>
    );
    } catch (error) {
      console.error('Error in render:', error);
      return (
        <Segment textAlign='center'>
          <h3>Something went wrong</h3>
          <p>Please refresh the page and try again.</p>
        </Segment>
      );
    }
  }
}

export default Playouts;
