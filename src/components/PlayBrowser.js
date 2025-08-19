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
    isPreviewingTrim: false
  };

  componentDidMount() {
    getData('shidur/playlist', playlist_db => {
      console.log(playlist_db);
      this.setState({playlist_db})
    })
    this.getWorkflow(this.state.date);
    this.initHls();
  };

  initHls = () => {
    const video = this.refs.player;
    if (Hls.isSupported()) {
      const hls = new Hls({debug: false});
      this.setState({hls})
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (err) => {
        console.log(err)
      });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        const lang_options = [];
        const video_options = [];

        hls.allAudioTracks.forEach(k => {
          // Switch to hebrew
          if(k.lang === "he") {
            hls.audioTrack = k.id;
            this.setState({selected_lang: k.id})
          }
          const val = {key:k.lang, text:k.name, value:k.id};
          lang_options.push(val)
        })
        this.setState({lang_options});

        hls.levels.forEach((k,i) => {
          const val = {key:k.height, text:k.height, value:i};
          video_options.push(val)
        })
        hls.currentLevel = 0
        this.setState({video_options});
      });
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
    hls.loadSource(hls_source);
    this.setState({hls_source, file_source, file_data: data, file_name: data.file_name, disabled: false});
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
        video.currentTime = newTime;
      }
    }
  }

  // Helper function to calculate clip duration from in/out points
  calculateClipDuration = (inpoint, outpoint) => {
    if (!inpoint || !outpoint) return 0;
    return outpoint - inpoint;
  }

  // Helper function to format time in HH:MM:SS format
  formatTime = (seconds) => {
    if (!seconds || seconds < 0) return '00:00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
    
    // Set the in/out points from the playlist item
    this.setState({
      inpoint: playlistItem.inpoint || null,
      outpoint: playlistItem.outpoint || null,
      editingPlaylistIndex: index !== null ? index : this.state.editingPlaylistIndex,
      isPreviewingTrim: false
    });
    
    console.log('Set in/out points:', { inpoint: playlistItem.inpoint, outpoint: playlistItem.outpoint });
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

  // Preview the trimmed version
  previewTrimmedVersion = () => {
    const { editingPlaylistIndex, playlist } = this.state;
    
    if (editingPlaylistIndex === null || editingPlaylistIndex === undefined) {
      console.log('No item selected for editing');
      return;
    }
    
    const playlistItem = playlist[editingPlaylistIndex];
    
    if (playlistItem.inpoint && playlistItem.outpoint) {
      // Load the trimmed version
      const trimmedHlsPath = `https://src.bbdomain.org/${playlistItem.file_path}/clipFrom/${playlistItem.inpoint}/clipTo/${playlistItem.outpoint}/master.m3u8`;
      
      if (this.state.hls) {
        this.state.hls.loadSource(trimmedHlsPath);
        console.log('Previewing trimmed version:', trimmedHlsPath);
      }
      
      this.setState({ isPreviewingTrim: true });
    } else {
      console.log('No in/out points set for trimming');
    }
  }

  // Return to full file view
  returnToFullFile = () => {
    const { editingPlaylistIndex, playlist } = this.state;
    
    if (editingPlaylistIndex === null || editingPlaylistIndex === undefined) {
      console.log('No item selected for editing');
      return;
    }
    
    const playlistItem = playlist[editingPlaylistIndex];
    
    // Load the full file
    const fullHlsPath = `https://src.bbdomain.org/${playlistItem.file_path}/master.m3u8`;
    
    if (this.state.hls) {
      this.state.hls.loadSource(fullHlsPath);
      console.log('Returned to full file:', fullHlsPath);
    }
    
    this.setState({ isPreviewingTrim: false });
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
      this.setState({ inpoint: null, outpoint: null, isPreviewingTrim: false });
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

  render() {
    const {isHls, inpoint, outpoint, find_uid, autoplay, selected_playlist, playlist_db, playlist_name, file_data, lang_options, video_options, selected_lang, files, selected_video, playlist, playlistDate, editingPlaylistIndex, isPreviewingTrim} = this.state;

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
                icon="edit"
                content="Edit"
              />
              <Button 
                size="mini" 
                negative 
                onClick={() => this.removeFromPlaylist(i)}
                icon="trash"
                content="Remove"
              />
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
        <Label attached='top' size='big' >

        </Label>

        <Grid>
          <GridRow columns={2} divided stackable>
            <GridColumn stretched>
              <Segment>
                <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto' }}>
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
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <Button onClick={() => this.skipTime(-300)} size="small">-5m</Button>
                      <Button onClick={() => this.skipTime(-60)} size="small">-1m</Button>
                      <Button onClick={() => this.skipTime(-10)} size="small">-10s</Button>
                      <Button onClick={() => this.skipTime(-5)} size="small">-5s</Button>
                      <Button onClick={() => this.skipTime(-1)} size="small">-1s</Button>
                      <Button onClick={() => this.skipTime(1)} size="small">+1s</Button>
                      <Button onClick={() => this.skipTime(5)} size="small">+5s</Button>
                      <Button onClick={() => this.skipTime(10)} size="small">+10s</Button>
                      <Button onClick={() => this.skipTime(60)} size="small">+1m</Button>
                      <Button onClick={() => this.skipTime(300)} size="small">+5m</Button>
                    </div>
                  </div>

                  {/* Editing Controls */}
                  {editingPlaylistIndex !== null && editingPlaylistIndex !== undefined && (
                    <div className="editing-controls" style={{ margin: '16px 0', padding: '12px' }}>
                      <div className="editing-header" style={{ textAlign: 'center', marginBottom: '8px' }}>
                        🎬 Editing Playlist Item #{editingPlaylistIndex + 1}
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
                        <Button 
                          secondary 
                          size="small" 
                          onClick={this.previewTrimmedVersion}
                          disabled={!inpoint || !outpoint}
                        >
                          👁️ Preview Trim
                        </Button>
                        <Button 
                          basic 
                          size="small" 
                          onClick={this.returnToFullFile}
                          disabled={!isPreviewingTrim}
                        >
                          🔄 Return to Full File
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <Label attached='bottom' size='big' >
                  <Dropdown
                    // disabled={!id}
                    // compact
                    className=""
                    selection
                    options={lang_options}
                    defaultValue={7}
                    value={selected_lang}
                    onChange={(e, {value}) => this.setLang(value)}
                  >
                  </Dropdown>
                  <Dropdown
                    // disabled={!id}
                    // compact
                    className=""
                    selection
                    options={video_options}
                    value={selected_video}
                    // defaultValue="Workflow"
                    onChange={(e, {value}) => this.setVideo(value)}
                  >
                  </Dropdown>
                </Label>
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
                      <Table.Cell>Source</Table.Cell>
                      <Table.Cell>
                        <Button
                          disabled={!file_data}
                          onClick={this.addToPlaylist}
                          size="small"
                        >Add to playlist
                        </Button>
                        {/*<Dropdown*/}
                        {/*  // disabled={!id}*/}
                        {/*  compact*/}
                        {/*  className="trim_src_dropdown"*/}
                        {/*  selection*/}
                        {/*  options={src_options}*/}
                        {/*  defaultValue="Workflow"*/}
                        {/*  onChange={(e, {value}) => this.setSrc(value)}*/}
                        {/*>*/}
                        {/*</Dropdown>*/}
                      </Table.Cell>
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
                          action="find"
                          placeholder='36SHmz3G'
                          value={find_uid}
                          onChange={(e, { value }) => this.setState({find_uid: value})}
                        ><input /><Button onClick={() => this.findByUID()} size="small">Find</Button></Input>
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell>IN</Table.Cell>
                      <Table.Cell>
                        <Button as='div' labelPosition='right' className="inout_btn">
                          <Button icon color='grey' className="inout_btn" onClick={() => this.setIn(null)} />
                          <Label as='a' basic pointing='left' onDoubleClick={() => this.jumpPoint(null)}>
                            { inpoint ? inpoint : "<- Set in" }
                          </Label>
                        </Button>
                      </Table.Cell>
                      <Table.Cell>OUT</Table.Cell>
                      <Table.Cell>
                        <Button as='div' labelPosition='left' className="inout_btn">
                          <Label as='a' basic pointing='right' color={inpoint > outpoint ? 'red' : ''}
                                 onDoubleClick={() => this.jumpPoint(outp)}>
                            {outpoint ? outpoint : "Set out ->"}
                          </Label>
                          <Button icon color='grey' className="inout_btn" onClick={() => this.setOut()}/>
                        </Button>
                      </Table.Cell>
                      <Table.Cell>HLS</Table.Cell>
                      <Table.Cell>
                        <Checkbox toggle checked={isHls} onChange={() => this.setState({isHls: !isHls})} />
                      </Table.Cell>
                    </Table.Row>
                  </Table.Body>
                  <Table.Footer>
                    <Table.Row>
                      <Table.HeaderCell>Files</Table.HeaderCell>
                      <Table.HeaderCell colSpan='6'>
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
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Footer>
                </Table>
              </Segment>
              <Segment>
                <Table basic='very'>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell />
                      <Table.HeaderCell />
                    </Table.Row>
                  </Table.Header>

                  <Table.Body>
                    <Table.Row>
                      <Table.Cell>Content UID</Table.Cell>
                      <Table.Cell>
                        <a target="_blank" rel="noopener noreferrer" href={`${MDB_UNIT_URL}/${file_data?.line?.unit_id}`}><b>{file_data?.line?.uid}</b></a>
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell>Source File UID</Table.Cell>
                      <Table.Cell>
                        {file_data?.source?.converted?.file_uid}
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell>Source SHA1</Table.Cell>
                      <Table.Cell>
                        {file_data?.sha1}
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell>Kmedia File UID</Table.Cell>
                      <Table.Cell>
                        {file_data?.source?.kmedia?.file_uid}
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell>Kmedia SHA1</Table.Cell>
                      <Table.Cell>
                        {file_data?.source?.kmedia?.sha1}
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell>Duration</Table.Cell>
                      <Table.Cell>
                        {toHms(file_data?.source?.kmedia?.duration || "")}
                      </Table.Cell>
                    </Table.Row>
                  </Table.Body>
                  {/*<Table.Footer>*/}
                  {/*  <Table.Row>*/}
                  {/*    <Table.HeaderCell><b>Content UID</b></Table.HeaderCell>*/}
                  {/*    <Table.HeaderCell colSpan='4'>*/}

                  {/*    </Table.HeaderCell>*/}
                  {/*  </Table.Row>*/}
                  {/*</Table.Footer>*/}
                </Table>
              </Segment>
            </GridColumn>
          </GridRow>
          <GridRow>
            <GridColumn>
              <Table color="red" unstackable>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>
                      <Button disabled={!selected_playlist} onClick={this.loadPlaylist} size="small">Load playlist</Button>
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      <Dropdown
                        // disabled={!id}
                        // compact
                        className=""
                        selection
                        options={playlist_options}
                        value={selected_playlist}
                        onChange={(e, {value}) => this.editPlaylist(value)}
                      >
                      </Dropdown>
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      <Button negative disabled={!selected_playlist} onClick={this.removePlaylist} size="small">Remove playlist</Button>
                    </Table.HeaderCell>
                    <Table.HeaderCell></Table.HeaderCell>
                    <Table.HeaderCell></Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
              </Table>
            </GridColumn>
          </GridRow>
          <GridRow>
            <GridColumn>
              <Table color="blue" unstackable>
                <Table.Footer>
                  <Table.Row>
                    <Table.HeaderCell><Button disabled={playlist.length === 0} onClick={this.savePlaylist} size="small">Save playlist</Button></Table.HeaderCell>
                    <Table.HeaderCell><Input value={playlist_name} placeholder='Playlist name' onChange={(e) => {this.setState({playlist_name: e.target.value})}} /></Table.HeaderCell>
                    <Table.HeaderCell>
                      <DatePicker
                        className="timepickercs"
                        dateFormat="yyyy/MM/dd HH:mm"
                        // locale={he}
                        showYearDropdown
                        showMonthDropdown
                        showTimeInput
                        scrollableYearDropdown
                        maxDate={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)}
                        selected={playlistDate}
                        onChange={this.setPlaylistDate}
                      />
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      <Checkbox checked={autoplay} label='AutoPlay' toggle onChange={() => this.setState({autoplay: !autoplay})} />
                    </Table.HeaderCell>
                    <Table.HeaderCell>Total: {toHms(playlist.map((r) => Number(r?.duration)).reduce((su, cur) => su + cur, 0))}</Table.HeaderCell>
                  </Table.Row>
                </Table.Footer>
              </Table>
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
      </Segment>
    );
  }
}

export default Playouts;
