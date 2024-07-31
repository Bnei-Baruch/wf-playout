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
import {getData, MDB_UNIT_URL, toHms} from "../shared/tools";
import DatePicker from "react-datepicker";


class Monitor extends Component {

  state = {
    allow: null,
    streamer: {},
    workflow: {},
    galaxy: {},
    stream: {},
    janus: {},
    status: {},
    user: null,
    playlist: [],
    playlist_name: "",
    playlist_db: {},
    playlist_options: [],
    selected_playlist: "",
    file_data: "",
    playlistDate: new Date(),
  };

  componentDidMount() {
    getData('shidur/playlist', playlist_db => {
      console.log(playlist_db);
      this.setState({playlist_db})
    })
    getData(`streamer`, (streamer) => {
      console.log(":: Got streamer: ",streamer);
      const {encoders,decoders,captures,playouts,workflows,restream} = streamer;
      this.setState({encoders,decoders,captures,playouts,workflows,restream,streamer});
      const user = {id: "asdfaefadsfdfa234234", email: "mail@mail.com"}
      mqtt.init(user, (data) => {
        console.log("[mqtt] init: ", data);
        const watch = 'exec/service/data/#';
        const local = true
        const topic = local ? watch : 'bb/' + watch;
        mqtt.join(topic);
        this.getStat()
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

  startPlayout = () => {
    this.setState({status: "On"});
    mqtt.send("start", false, "exec/service/gst-play-1/sdi");
  };

  stopPlayout = () => {
    this.setState({status: "Off", file_name: null});
    mqtt.send("stop", false, "exec/service/gst-play-1/sdi");
  };

  loadPlaylist = () => {
    const {selected_playlist, playlist_db} = this.state;
    const playlist = playlist_db[selected_playlist]["playlist"];
    this.setState({playlist});
  };

  editPlaylist = (selected_playlist) => {
    this.setState({selected_playlist});
  };

  render() {
    const {allow, playlist_db, selected_playlist, playlistDate, playlist_name, galaxy, playlist, file_data} = this.state;

    //let login = (<LoginPage user={user} allow={allow} checkPermission={this.checkPermission} />);

    const list = playlist.map((data, i) => {
      const {source_id, sha1, file_name, uid, file_uid, duration} = data;
      return (
        <Table.Row key={i}>
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
                    <Table.HeaderCell></Table.HeaderCell>
                    <Table.HeaderCell></Table.HeaderCell>
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
