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
  GridColumn, Button, Input
} from 'semantic-ui-react'
import {
  getData,
  getWorkflowData,
  langch_options,
  MDB_UNIT_URL,
  putData,
  streamFetcher,
  toHms,
  vres_options
} from "../shared/tools";


class Playouts extends Component {

  state = {
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
    playlist_name: ""
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
    let hls_source = `https://cdn.kab.info/${data.source.kmedia.file_uid}.m3u8`
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
    const {file_data, playlist} = this.state;
    const {source_id, sha1, file_name, line: {uid}, source: {converted: {filename, file_uid, duration}}} = file_data;
    const playraw = {source_id, sha1, file_name, uid, file_uid, duration, file_path: filename};
    playlist.push(playraw);
    this.setState({playlist});
    console.log(playlist)
  };

  savePlaylist = () => {
    const {playlist, playlist_name, playlistDate} = this.state;
    const date = playlistDate.toLocaleDateString('sv')
    const json = {[date]: playlist}
    putData(`shidur/playlist/${playlist_name}`, json, data => {
      console.log(":: Save playlist: ", json, data);
    } )
  };

  setPlaylistDate = (data) => {
    let date = data.toLocaleDateString('sv');
    this.setState({playlistDate: data});
  }

  render() {
    const {playlist_name, file_data, lang_options, video_options, selected_lang, files, selected_video, playlist, playlistDate} = this.state;

    let files_list = files.map((data, i) => {
      return ({ key: i, text: data.file_name, value: data })
    });

    const list = playlist.map((data, i) => {
      const {source_id, sha1, file_name, uid, file_uid, duration} = data;
      return (
        <Table.Row>
          <Table.Cell>{source_id}</Table.Cell>
          <Table.Cell>{file_name}</Table.Cell>
          <Table.Cell>{sha1}</Table.Cell>
          <Table.Cell>{uid}</Table.Cell>
          <Table.Cell>{toHms(duration)}</Table.Cell>
        </Table.Row>
      )
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
          <GridRow columns={2} divided>
            <GridColumn stretched>
              <Segment>
                <video
                  ref='player'
                  width={640}
                  height={360}
                  // autoPlay
                  controls
                  playsInline={true}
                />
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
                <Table basic='very'>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell/>
                      <Table.HeaderCell/>
                      <Table.HeaderCell/>
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
                    </Table.Row>
                  </Table.Body>
                  <Table.Footer>
                    <Table.Row>
                      <Table.HeaderCell>Files</Table.HeaderCell>
                      <Table.HeaderCell colSpan='4'>
                        <Dropdown
                          // disabled={!id}
                          fluid
                          // className="trim_files_dropdown"
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
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>ID</Table.HeaderCell>
                    <Table.HeaderCell>File Name</Table.HeaderCell>
                    <Table.HeaderCell>SHA1</Table.HeaderCell>
                    <Table.HeaderCell>Content UID</Table.HeaderCell>
                    <Table.HeaderCell>Duration</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>

                <Table.Body>
                  {list}
                </Table.Body>
                <Table.Footer>
                  <Table.Row>
                    <Table.HeaderCell><Button onClick={this.savePlaylist}>Save playlist</Button></Table.HeaderCell>
                    <Table.HeaderCell><Input value={playlist_name} placeholder='Playlist name' onChange={(e) => {this.setState({playlist_name: e.target.value})}} /></Table.HeaderCell>
                    <Table.HeaderCell>
                      <DatePicker
                        className="datepickercs"
                        dateFormat="yyyy-MM-dd"
                        // locale={he}
                        showYearDropdown
                        showMonthDropdown
                        scrollableYearDropdown
                        maxDate={new Date()}
                        selected={playlistDate}
                        onChange={this.setPlaylistDate}
                      />
                    </Table.HeaderCell>
                    <Table.HeaderCell>Total:</Table.HeaderCell>
                    <Table.HeaderCell>{toHms(playlist.map((r) => Number(r?.duration)).reduce((su, cur) => su + cur, 0))}</Table.HeaderCell>
                  </Table.Row>
                </Table.Footer>
              </Table>
            </GridColumn>
          </GridRow>
        </Grid>
      </Segment>
    );
  }
}

export default Playouts;
