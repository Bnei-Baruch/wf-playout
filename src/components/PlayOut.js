import React, {Component, Fragment} from 'react'
import {
  Grid,
  Message,
  List,
  Label,
  Segment,
  GridRow,
  GridColumn,
  Dropdown,
  Table,
  Button,
  Input
} from 'semantic-ui-react'
import mqtt from "../shared/mqtt";
import {kc} from "./UserManager";
import LoginPage from "./LoginPage";
import {getData, MDB_UNIT_URL, putData, toHms} from "../shared/tools";
import DatePicker from "react-datepicker";


class Monitor extends Component {

  state = {
    autoplay_start: false,
    allow: null,
    streamer: {},
    workflow: {},
    galaxy: {},
    stream: {},
    janus: {},
    status: "Off",
    user: null,
    playlist: [],
    playlist_name: "",
    playlist_db: {},
    playlist_options: [],
    playlist_index: 0,
    selected_playlist: "",
    file_data: "",
    playlistDate: new Date(),
    playback_timer: 0,
    date: new Date().toLocaleDateString('sv'),
    now: new Date(),
    time: "00:00:00",
    shDate: "",
    shTime: "",
  };

  componentDidMount() {
    getData('shidur/playlist', playlist_db => {
      console.log(playlist_db);
      this.setState({playlist_db})
    })
    getData(`streamer/playouts/gst-play-1`, (playout) => {
      console.log(":: Got playout: ",playout);
      this.setState({playout});
      const user = {id: "asdfaefadsfdfa234234", email: "mail@mail.com"}
      mqtt.init(user, (data) => {
        console.log("[mqtt] init: ", data);
        const watch = 'exec/service/data/#';
        const local = true
        const topic = local ? watch : 'bb/' + watch;
        mqtt.join(topic);
        this.getStat()
        //this.runTimer();
        mqtt.watch((message, topic) => {
          this.onMqttMessage(message, topic);
        }, false)
      })
    });
  };

  checkPermission = (user) => {
    this.setState({user});
    const allow = kc.hasRealmRole("shidur_root");
    if(allow) {
      this.setState({allow});
    } else {
      this.setState({allow: false});
    }
  };

  shchTimer = () => {
    setInterval(() => {
      const {selected_playlist, autoplay_start} = this.state;
      const time = new Date().toTimeString().slice(0, 8);
      this.setState({time, now: new Date()});
      if(selected_playlist && !autoplay_start) {
        const {selected_playlist, playlist_db} = this.state;
        const now = new Date();
        const playlistDate = new Date(playlist_db[selected_playlist]["date"])
        console.log(now - playlistDate)
        if(now - playlistDate > 0 && !autoplay_start) {
          this.setState({autoplay_start: true});
          this.startAutoPlay();
        }
      }
    }, 1000)
  }

  getStat = () => {
    mqtt.send("status", false, "exec/service/gst-play-1/sdi");
  };

  onMqttMessage = (message, topic) => {
    const local = true
    const src = local ? topic.split("/")[3] : topic.split("/")[4];
    if(message.action === "status") {
      console.log("[playout] Message: ", message);
      const status = message.data.alive ? "On" : "Off";
      const out_time = toHms(message.data.runtime);
      console.log("[out_time]: ", out_time);
      this.setState({status, out_time});
    }
  };


  startAutoPlay = () => {
    console.log("--startAutoPlay--");
    this.startPlayout();
  }

  startPlayout = () => {
    const {playout, playlist, playlist_index} = this.state;
    const {file_name, file_path, source_id} = playlist[playlist_index]
    playout.jsonst = {file_name, file_path, source_id};
    putData(`streamer/playouts/gst-play-1`, playout, data => {
      console.log("startPlayout: ", data);
      this.setState({status: "On"});
      mqtt.send("start", false, "exec/service/gst-play-1/sdi");
      this.runTimer();
    })
  };

  stopPlayout = (next) => {
    console.log(next)
    this.setState({status: "Off", file_name: null});
    mqtt.send("stop", false, "exec/service/gst-play-1/sdi");
    clearInterval(this.state.ival);
    if(next) {
      setTimeout(() => {
        this.startPlayout()
      }, 3000)
    } else {
      this.setState({playback_timer: 0});
    }
  };

  loadPlaylist = () => {
    const {selected_playlist, playlist_db} = this.state;
    const playlist = playlist_db[selected_playlist]["playlist"];
    const playlistDate = new Date(playlist_db[selected_playlist]["date"])
    const shDate = playlistDate.toLocaleDateString('sv');
    const shTime = playlistDate.toTimeString().slice(0, 5);
    this.setState({playlist, playlistDate, shDate, shTime});
  };

  editPlaylist = (selected_playlist) => {
    this.setState({selected_playlist});
  };

  runTimer = () => {
    let {playback_timer, playlist_index, playlist} = this.state;
    const {duration} = playlist[playlist_index]
    if(this.state.ival)
      clearInterval(this.state.ival);
    let ival = setInterval(() => {
      if(duration && playback_timer > Number(duration)) {
        const loop = playlist.length < playlist_index ? 0 : playlist_index+1;
        this.setState({playback_timer: 0, playlist_index: loop});
        this.stopPlayout(true)
      } else {
        this.setState({playback_timer: playback_timer++})
      }
    }, 1000);
    this.setState({ival});
  };

  // runTimer = () => {
  //   this.getStat();
  //   if(this.state.ival)
  //     clearInterval(this.state.ival);
  //   let ival = setInterval(() => {
  //     this.getStat();
  //   }, 1000);
  //   this.setState({ival});
  // };

  render() {
    const {shDate, shTime, date, time, playback_timer, playlist_db, selected_playlist, status, playlist_index, galaxy, playlist, file_data} = this.state;

    //let login = (<LoginPage user={user} allow={allow} checkPermission={this.checkPermission} />);

    const list = playlist.map((data, i) => {
      const {source_id, sha1, file_name, uid, file_uid, duration} = data;
      return (
        <Table.Row key={i} active={playlist_index === i}>
          <Table.Cell>{source_id}</Table.Cell>
          <Table.Cell>{file_name}</Table.Cell>
          <Table.Cell>{sha1}</Table.Cell>
          <Table.Cell>{uid}</Table.Cell>
          <Table.Cell>{toHms(duration)}</Table.Cell>
        </Table.Row>
      )
    });

    const playlist_options = Object.keys(playlist_db).map((k) => {
      return ({key: k, text: k, value: k})
    })


    return(
      <Segment textAlign='center' >
        <Label attached='top' size='big' >

        </Label>

        <Grid>
          <GridRow columns={2} divided>
            <GridColumn stretched>
              <Segment color='green' style={{fontSize: 150}} >{toHms(playback_timer)}</Segment>
            </GridColumn>
            <GridColumn>

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
                      <Table.Cell>Today</Table.Cell>
                      <Table.Cell>
                        <b>{date}</b> <b>{time}</b>
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell>Schedule</Table.Cell>
                      <Table.Cell>
                        <b>{shDate}</b> <b>{shTime}</b>
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
                    <Table.Row>
                      <Table.Cell>
                      </Table.Cell>
                      <Table.Cell>
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
                    <Table.HeaderCell>
                      <Button onClick={this.loadPlaylist}>Load playlist</Button>
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
                      <Button disabled={playlist.length === 0 || status === "On"} positive fluid onClick={this.startPlayout}>Start</Button>
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      <Button disabled={status === "Off"} negative fluid onClick={() => this.stopPlayout(false)}>Stop</Button>
                    </Table.HeaderCell>
                    <Table.HeaderCell></Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
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

export default Monitor;
