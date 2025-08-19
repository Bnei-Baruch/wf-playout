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


class Playouts extends Component {

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
    inpoint: null,
    outpoint: null,
    isHls: true,
    editingPlaylistIndex: null,
    showSettings: false
  };

  componentDidMount() {
    getData('shidur/playlist', playlist_db => {
      console.log(playlist_db);
      this.setState({playlist_db})
    })
    this.getWorkflow(this.state.date);
    this.initHls();
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
    const video = this.refs.player;
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

  setIn = () => {
    let currentTime = this.refs.player.currentTime;
    // Round down to the start of the current second
    let alignedTime = Math.floor(currentTime) * 1000;
    console.log(":: Set IN: ", alignedTime, "(original:", currentTime * 1000, ")");
    this.setState({inpoint: alignedTime});
  };

  setOut= () => {
    let currentTime = this.refs.player.currentTime;
    // Round up to the end of the current second
    let alignedTime = Math.ceil(currentTime) * 1000;
    console.log(":: Set OUT: ", alignedTime, "(original:", currentTime * 1000, ")");
    this.setState({outpoint: alignedTime});
  };

  getWorkflow = (date) => {
    getWorkflowData(`source/find?key=date&value=${date}`, (data) => {
      console.log(":: Got workflow: ",data);
      this.setState({files: data})
    });
  };

  selectFile = (data) => {
    console.log(":: Select file: ", data);
    const {hls} = this.state;
    
    if (!hls) {
      console.log("HLS not initialized");
      return;
    }
    
    try {
      let file_source = `https://wfsrv.bbdomain.org/wfapi${data.source.converted.filename}`

      // External kmedia
      //let hls_source = `https://cdn.kab.info/${data.source.kmedia.file_uid}.m3u8`
      //hls.loadSource(hls_source);

      // Local kmdeia
      // const path = data.source.kmedia.filename.split('/backup/files/kmedia/')[1]
      // const uid = data.source.kmedia.file_uid
      // let hls_source = `https://hls.bbdomain.org/${uid}/${path}/master.m3u8`

      // Local source
      const path = data.source.converted.filename.split('/backup/files/sources/')[1]
      let hls_source = `https://src.bbdomain.org/${path}/master.m3u8`
      
      // Safely load the source
      hls.loadSource(hls_source);
      this.setState({hls_source, file_source, file_data: data, file_name: data.file_name, disabled: false});
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
    const {isHls, inpoint, outpoint, hls_source, file_data, playlist} = this.state;
    const {source_id, sha1, file_name, line: {uid}, source: {converted: {filename, file_uid, duration}}} = file_data;
    const path = filename.split('/backup/files/sources/')[1]
    let hls_path
    if(inpoint && outpoint) {
      hls_path = `https://src.bbdomain.org/${path}/clipFrom/${inpoint}/clipTo/${outpoint}/master.m3u8`
    } else {
      hls_path = `https://src.bbdomain.org/${path}/master.m3u8`
    }
    const playraw = {source_id, sha1, file_name, uid, file_uid, duration, file_path: path, hls_path, isHls, inpoint, outpoint};
    playlist.push(playraw);
    this.setState({playlist});
    console.log(playlist)
  };

  savePlaylist = () => {
    const {autoplay, playlist, playlist_name, playlistDate} = this.state;
    const date = playlistDate.toUTCString();
    const total = toHms(playlist.map((r) => Number(r?.duration)).reduce((su, cur) => su + cur, 0));
    const json = {autoplay, playlist, date, total}
    putData(`shidur/playlist/${playlist_name}`, json, data => {
      console.log(":: Save playlist: ", json, data);
      //TODO: Clear state
    } )
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
    console.log(playlist_db[selected_playlist])
    const playlist = playlist_db[selected_playlist]["playlist"];
    const playlistDate = new Date(playlist_db[selected_playlist]["date"])
    this.setState({autoplay, playlist, playlistDate, playlist_name: selected_playlist});
    
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
    const video = this.refs.player;
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

  // Helper function to calculate clip duration from in/out points
  calculateClipDuration = (inpoint, outpoint) => {
    if (!inpoint || !outpoint) return 0;
    return outpoint - inpoint;
  }

  // Helper function to format time in HH:MM:SS format
  formatTime = (milliseconds) => {
    if (!milliseconds || milliseconds < 0) return '00:00:00';
    // Convert milliseconds to seconds first
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Function to jump player to specific time
  jumpPoint = (timeInMilliseconds) => {
    if (!timeInMilliseconds || !this.refs.player) return;
    
    // Convert milliseconds to seconds for the video player
    const timeInSeconds = timeInMilliseconds / 1000;
    
    try {
      // Set the player's current time
      this.refs.player.currentTime = timeInSeconds;
      console.log(`Jumped to time: ${this.formatTime(timeInMilliseconds)} (${timeInSeconds}s)`);
    } catch (error) {
      console.log('Error during jump operation:', error);
    }
  }

  // Function to jump to the end of the video
  jumpToEnd = () => {
    const video = this.refs.player;
    if (!video || !video.duration) return;
    
    try {
      // Jump to the end (subtract 1 second to avoid going past the end)
      const endTime = Math.max(0, video.duration - 1);
      video.currentTime = endTime;
      
      console.log(`Jumped to end: ${endTime}s`);
    } catch (error) {
      console.log('Error during jump to end operation:', error);
    }
  }

  // Load a playlist item onto the player for editing
  loadPlaylistItemToPlayer = (playlistItem, index = null) => {
    console.log('Loading playlist item to player:', playlistItem);
    
    // Always load the full file for editing (not the trimmed version)
    const fullHlsPath = `https://src.bbdomain.org/${playlistItem.file_path}/master.m3u8`;
    
    // Set the HLS source to the full file
    if (this.state.hls) {
      this.state.hls.loadSource(fullHlsPath);
      console.log('Loaded full file for editing:', fullHlsPath);
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
    
    // Set the in/out points from the playlist item and file_data
    this.setState({
      inpoint: playlistItem.inpoint || null,
      outpoint: playlistItem.outpoint || null,
      editingPlaylistIndex: index !== null ? index : this.state.editingPlaylistIndex,
      file_data: file_data,
      file_name: playlistItem.file_name
    });
    
    console.log('Set in/out points:', { inpoint: playlistItem.inpoint, outpoint: playlistItem.outpoint });
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
    const { editingPlaylistIndex, inpoint, outpoint, playlist } = this.state;
    
    if (editingPlaylistIndex === null || editingPlaylistIndex === undefined) {
      console.log('No item selected for editing');
      return;
    }
    
    console.log('Updating playlist item at index:', editingPlaylistIndex, { inpoint, outpoint });
    
    // Update the playlist item
    const updatedPlaylist = [...playlist];
    updatedPlaylist[editingPlaylistIndex] = {
      ...updatedPlaylist[editingPlaylistIndex],
      inpoint,
      outpoint
    };
    
    // Update the hls_path if both in/out points are set
    if (inpoint && outpoint) {
      const { file_path } = updatedPlaylist[editingPlaylistIndex];
      updatedPlaylist[editingPlaylistIndex].hls_path = `https://src.bbdomain.org/${file_path}/clipFrom/${inpoint}/clipTo/${outpoint}/master.m3u8`;
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
      editingPlaylistIndex: newEditingIndex 
    });
    
    console.log('Updated playlist after removal:', updatedPlaylist);
  }

  // Toggle settings popup
  toggleSettings = () => {
    this.setState(prevState => ({ showSettings: !prevState.showSettings }));
  }

  render() {
    const {isHls, inpoint, outpoint, find_uid, autoplay, selected_playlist, playlist_db, playlist_name, file_data, lang_options, video_options, selected_lang, files, selected_video, playlist, playlistDate, editingPlaylistIndex, showSettings} = this.state;

    let files_list = files.map((data, i) => {
      return ({ key: data.source_id, text: data.file_name, value: data })
    });

    const list = playlist.map((data, i) => {
      const {source_id, file_name, uid, duration, inpoint, outpoint} = data;
      const clipDuration = this.calculateClipDuration(inpoint, outpoint);
      return (
        <Table.Row 
          key={i} 
          className={editingPlaylistIndex === i ? 'editing-row' : ''}
        >
          <Table.Cell>{source_id}</Table.Cell>
          <Table.Cell>{file_name}</Table.Cell>
          <Table.Cell className="time-column">{inpoint ? this.formatTime(inpoint) : '00:00:00'}</Table.Cell>
          <Table.Cell className="time-column">{outpoint ? this.formatTime(outpoint) : '00:00:00'}</Table.Cell>
          <Table.Cell className="time-column clip-duration">{this.formatTime(clipDuration)}</Table.Cell>
          <Table.Cell>{toHms(duration)}</Table.Cell>
          <Table.Cell>{uid}</Table.Cell>
          <Table.Cell className="actions-cell">
            <div style={{ display: 'flex', gap: '4px' }}>
              <Button 
                size="mini" 
                primary 
                onClick={() => this.editPlaylistItem(i)}
              >
                Edit
              </Button>
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
    });

    const playlist_options = Object.keys(playlist_db).map((k) => {
      return ({key: k, text: k, value: k})
    })

    const src_options = [
      { key: 1, text: 'Workflow', value: 'Workflow' },
      { key: 2, text: 'Backup', value: 'Backup' },
    ];

    return(
      <Segment textAlign='center' >

        <Grid>
          <GridRow columns={2} divided stackable>
            <GridColumn stretched>
              <Segment>
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
                    ref='player'
                    width="100%"
                    height="auto"
                    style={{ maxWidth: '100%', height: 'auto' }}
                    // autoPlay
                    controls
                    playsInline={true}
                  />
                  
                  {/* Skip Controls */}
                  <div className="skip-controls" style={{ margin: '16px 0' }}>
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
                  </div>

                                    {/* IN/OUT Controls - Moved under the player and skip controls */}
                  {file_data && (
                    <div style={{ margin: '16px 0', padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        <Button as='div' labelPosition='right' className="inout_btn">
                          <Button icon color='blue' size='large' className="inout_btn" onClick={() => this.setIn(null)} />
                          <Label as='a' basic pointing='left' onClick={() => this.jumpPoint(inpoint)} style={{ cursor: 'pointer' }}>
                            { inpoint ? this.formatTime(inpoint) : "<- Set in" }
                          </Label>
                        </Button>
                        <Button as='div' labelPosition='left' className="inout_btn">
                          <Label as='a' basic pointing='right' color={inpoint > outpoint ? 'red' : undefined}
                                 onClick={() => this.jumpPoint(outpoint)} style={{ cursor: 'pointer' }}>
                            {outpoint ? this.formatTime(outpoint) : "Set out ->"}
                          </Label>
                          <Button icon color='blue' size='large' className="inout_btn" onClick={() => this.setOut()}/>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Add to Playlist Button - Always visible when file is loaded, but disabled when editing */}
                  {file_data && (
                    <div style={{ margin: '16px 0', padding: '12px', textAlign: 'center' }}>
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
                  {editingPlaylistIndex !== null && editingPlaylistIndex !== undefined && (
                    <div className="editing-controls" style={{ margin: '16px 0', padding: '12px' }}>
                      <div className="editing-header" style={{ textAlign: 'center', marginBottom: '8px' }}>
                        🎬 Editing Playlist Item #{editingPlaylistIndex + 1} - Set In/Out Points
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <Button
                          primary
                          size="small"
                          onClick={this.updateCurrentPlaylistItem}
                          disabled={editingPlaylistIndex === null || editingPlaylistIndex === undefined}
                        >
                          💾 Update Item
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

              </Segment>
            </GridColumn>
            <GridColumn>
              <Segment>
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
                            placeholder="Select File To Play:"
                            selection
                            value={file_data}
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
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e9ecef', overflow: 'hidden' }}>
                  {/* Top Section - Load playlist controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', width: '100%', justifyContent: 'center' }}>
                    <Button disabled={!selected_playlist} onClick={this.loadPlaylist} size="small">Load playlist</Button>
                    <Dropdown
                      // disabled={!id}
                      compact
                      className=""
                      selection
                      options={playlist_options}
                      value={selected_playlist}
                      onChange={(e, {value}) => this.editPlaylist(value)}
                      style={{ minWidth: '200px' }}
                    >
                    </Dropdown>
                    <Button negative disabled={!selected_playlist} onClick={this.removePlaylist} size="small">Remove playlist</Button>
                  </div>
                  
                  {/* Separator line */}
                  <div style={{ width: '100%', height: '1px', backgroundColor: '#dee2e6' }}></div>
                  
                  {/* Bottom Section - Save playlist controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '30px', padding: '27px', width: '100%', justifyContent: 'center' }}>
                    <Button disabled={playlist.length === 0} onClick={this.savePlaylist} size="small">Save playlist</Button>
                    <Input value={playlist_name} placeholder='Playlist name' size="small" style={{ minWidth: '200px' }} onChange={(e) => {this.setState({playlist_name: e.target.value})}} />
                    <div style={{ padding: '8px 12px', backgroundColor: '#ffffff', border: '1px solid #dee2e6', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#666' }}>
                     Total: {toHms(playlist.map((r) => {
                       // Calculate clip duration from in/out points, or use full duration if no trimming
                       if (r?.inpoint && r?.outpoint) {
                         return (r.outpoint - r.inpoint) / 1000; // Convert milliseconds to seconds
                       }
                       return Number(r?.duration) || 0;
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
                    <Table.HeaderCell>Out Point</Table.HeaderCell>
                    <Table.HeaderCell>Clip Duration</Table.HeaderCell>
                    <Table.HeaderCell>File Duration</Table.HeaderCell>
                    <Table.HeaderCell>Content UID</Table.HeaderCell>
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
  }
}

export default Playouts;
