import React, {Component} from 'react'
import Hls from "hls.js";
//import moment from 'moment';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  Divider,
  Table,
  Segment,
  Label,
  Dropdown,
  Select,
  Message,
  Button,
  Icon,
  Grid,
  GridRow,
  GridColumn
} from 'semantic-ui-react'
import {getWorkflowData, langch_options, streamFetcher, toHms, vres_options} from "../shared/tools";
import mqtt from "../shared/mqtt";
import MediaPlayer from "./VideoPlayer/MediaPlayer";


class Playouts extends Component {

  state = {
    disabled: true,
    main: [],
    backup: [],
    trimmed: [],
    date: new Date().toLocaleDateString('sv'),
    startDate: new Date(),
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
  };

  componentDidMount() {
    this.getWorkflow(this.state.date)
    const video = this.refs.player;
    if (Hls.isSupported()) {
      const hls = new Hls({debug: false});
      this.setState({hls})
      //hls.loadSource(this.state.source);
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

        console.log(hls.allAudioTracks)
        console.log(hls.levels)
        console.log(hls)
      });
    }
  };

  componentWillUnmount() {
    // this.props.onRef(undefined)
    clearInterval(this.state.ival);
  };

  getPlayer = (player) => {
    console.log(":: Censor - got player: ", player);
  };

  getStat = () => {
    mqtt.send("status", false, "exec/service/gst-play-1/sdi");
  };

  onMqttMessage = (message, topic) => {
    const local = true
    const src = local ? topic.split("/")[3] : topic.split("/")[4];
    console.log("[playout] Message: ", message);
    if(message.action === "status") {
      const status = message.data.alive ? "On" : "Off";
      this.setState({status});
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
    const {src, id, playout, hls} = this.state;
    //let file_path = `https://wfsrv.bbdomain.org/wfapi/backup/files/backup/files/sources/${date.split('-').join('/')}/${data.file_name}`
    // playout.jsonst.file_name = data.file_name;
    // playout.jsonst.source_id = data.source_id;
    // playout.jsonst.file_path = file_path;
    //this.props.jsonState("playouts", {[id]: playout}, id);
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

  setPlayout = (id, playout) => {
    console.log(":: Set Playout: ",playout);
    this.setState({id, playout});
    if(id !== this.props.id)
      this.props.idState("playout_id", id);
    this.getStat()
  };

  setJsonState = (key, value) => {
    let {playout, id} = this.state;
    playout.jsonst[key] = value;
    this.props.jsonState("playouts", {[id]: playout}, id);
  };

  startPlayout = () => {
    this.setState({status: "On"});
    mqtt.send("start", false, "exec/service/gst-play-1/sdi");
  };

  stopPlayout = () => {
    this.setState({status: "Off", file_name: null});
    mqtt.send("stop", false, "exec/service/gst-play-1/sdi");
  };


  setLang = (val) => {
    console.log(val)
    this.state.hls.audioTrack = val;
    this.setState({selected_lang: val})
  }

  setVideo = (val) => {
    console.log(val)
    this.state.hls.currentLevel = val;
    this.setState({selected_video: val})
  }

  render() {

    // const {playouts} = this.props;
    const {file_data, lang_options, video_options, selected_lang, files, selected_video, month} = this.state;

    // let dec_options = Object.keys(playouts).map((id, i) => {
    //   let playout = playouts[id];
    //   return (
    //     <Dropdown.Item
    //       key={i}
    //       onClick={() => this.setPlayout(id, playout)}>{playout.name}
    //     </Dropdown.Item>
    //   )
    // });

    let files_list = files.map((data, i) => {
      return ({ key: i, text: data.file_name, value: data })
    });

    const src_options = [
      { key: 1, text: 'Workflow', value: 'Workflow' },
      { key: 2, text: 'Backup', value: 'Backup' },
    ];

    const year_options = [
      { key: 1, text: '2020', value: '2020' },
      { key: 2, text: '2019', value: '2019' },
      { key: 3, text: '2018', value: '2018' },
    ];

    const month_options = [
      { key: 1, text: '01', value: '01' },
      { key: 2, text: '02', value: '02' },
      { key: 3, text: '03', value: '03' },
      { key: 4, text: '04', value: '04' },
      { key: 5, text: '05', value: '05' },
      { key: 6, text: '06', value: '06' },
      { key: 7, text: '07', value: '07' },
      { key: 8, text: '08', value: '08' },
      { key: 9, text: '09', value: '09' },
      { key: 10, text: '10', value: '10' },
      { key: 11, text: '11', value: '11' },
      { key: 12, text: '12', value: '12' },
    ];

    return(
      <Segment textAlign='center' >
        <Label attached='top' size='big' >

        </Label>

        <Grid columns={2} divided>
          <GridRow stretched>
            <GridColumn>
              <Segment>
                {/*<MediaPlayer player={this.getPlayer} source={source} type='application/x-mpegURL'/>*/}
                <video
                  ref='player'
                  width={640}
                  height={360}
                  autoPlay
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
                        <Dropdown
                          // disabled={!id}
                          compact
                          className="trim_src_dropdown"
                          selection
                          options={src_options}
                          defaultValue="Workflow"
                          onChange={(e, {value}) => this.setSrc(value)}
                        >
                        </Dropdown>
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
                        {/*<Select disabled={!id}*/}
                        {/*        compact options={year_options}*/}
                        {/*        value={year}*/}
                        {/*        onChange={(e, {value}) => this.setYear(value)}*/}
                        {/*/>*/}
                        {/*<Select disabled={!id}*/}
                        {/*        compact options={month_options}*/}
                        {/*        value={month}*/}
                        {/*        onChange={(e, {value}) => this.setMonth(value)}*/}
                        {/*/>*/}
                      </Table.Cell>
                    </Table.Row>
                  </Table.Body>
                  <Table.Footer>
                    <Table.Row>
                      <Table.HeaderCell><b>Files</b></Table.HeaderCell>
                      <Table.HeaderCell colSpan='4'>
                        <Dropdown
                          // disabled={!id}
                          className="trim_files_dropdown"
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
                        {file_data?.line?.uid}
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
        </Grid>



        {/*<Message className='or_buttons' >*/}
        {/*  <Button.Group >*/}
        {/*    <Button positive disabled={status !== "Off"}*/}
        {/*            onClick={this.startPlayout}>Start</Button>*/}
        {/*    <Button.Or text='out' />*/}
        {/*    <Button negative disabled={status !== "On"}*/}
        {/*            onClick={this.stopPlayout}>Stop</Button>*/}
        {/*  </Button.Group>*/}
        {/*  {id ? <Label className='file_name'><Icon name='play' />{playouts[id].jsonst.file_name}</Label> : ""}*/}
        {/*</Message>*/}

      </Segment>
    );
  }
}

export default Playouts;
