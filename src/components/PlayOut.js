import React, {Component, Fragment} from 'react'
import {Grid, Message, List, Label} from 'semantic-ui-react'
import mqtt from "../shared/mqtt";
import {kc} from "./UserManager";
import LoginPage from "./LoginPage";
import {getData} from "../shared/tools";


class Monitor extends Component {

    state = {
        allow: null,
        streamer: {},
        workflow: {},
        galaxy: {},
        stream: {},
        janus: {},
        status: {},
        user: null
    };

    checkPermission = (user) => {
        this.setState({user});
        const allow = kc.hasRealmRole("shidur_root");
        if(allow) {
            this.setState({allow});
            getData(`streamer`, (streamer) => {
                console.log(":: Got streamer: ",streamer);
                this.setState({streamer});
                mqtt.init(user, (data) => {
                    console.log("[mqtt] init: ", data);
                    const exec_status = 'exec/status/#';
                    const wf_status = 'workflow/status/#';
                    const janus_status = 'janus/+/status';
                    mqtt.join(exec_status);
                    mqtt.join(janus_status);
                    mqtt.join(wf_status);
                    mqtt.watch((message, topic) => {
                        this.onMqttMessage(message, topic);
                    }, false)
                })
            });
        } else {
            this.setState({allow: false});
        }
    };

    onMqttMessage = (message, topic) => {
        //console.log("[encoders] Message: ", message, topic.split("/")[2]);
        const {status, workflow, galaxy, stream, janus} = this.state;
        const id = topic.split("/")[2]
        const root = topic.split("/")[0]
        switch (root) {
            case 'exec' :
                status[id] = message === "Online";
                this.setState({status});
                break;
            case 'workflow' :
                workflow[id] = message === "Online";
                this.setState({workflow});
                break;
            case 'janus' :
                const n = topic.split("/")[1];
                if(n.match(/^(gxy(\d+))$/)) {
                    galaxy[n] = message.online;
                    this.setState({galaxy});
                } else if(n.match(/^(str(\d))$/)) {
                    stream[n] = message.online;
                    this.setState({stream});
                } else {
                    janus[n] = message.online;
                    this.setState({janus});
                }
        }
    };

    render() {
        const {allow, status, user, streamer, workflow, galaxy, stream, janus} = this.state;

        let login = (<LoginPage user={user} allow={allow} checkPermission={this.checkPermission} />);


        let content = (
          <Segment textAlign='center' className='stream_segment' compact raised secondary>
            <Segment clearing color='blue'>
              <Header as='h1'>
                {config.header}
              </Header>
            </Segment>

            <Table basic='very' unstackable>
              <Table.Row>
                <Table.Cell textAlign='right'>
                  <Message compact className='vu_box'>
                    <canvas className='cvu' ref={"canvas1"} width="25" height="100" />
                    <canvas className='cvu' ref={"canvas2"} width="25" height="100" />
                    <canvas className='cvu' ref={"canvas3"} width="25" height="100" />
                    <canvas className='cvu' ref={"canvas4"} width="25" height="100" />
                  </Message>
                </Table.Cell>
                <Table.Cell textAlign='center'>
                  <Message compact
                           negative={!main_online}
                           positive={main_online}
                           className='main_timer' >{main_timer}</Message>
                </Table.Cell>
              </Table.Row>
            </Table>

            <Segment clearing color='blue'>
              <Table basic='very'  unstackable>
                <Table.Row>
                  <Table.Cell>
                    <Button fluid size='huge'
                            disabled={next_loading || backup_online || start_loading}
                            loading={start_loading}
                            positive
                            onClick={this.startCapture} >
                      Start
                    </Button>
                  </Table.Cell>
                  <Table.Cell>
                    <Button fluid size='huge'
                            disabled={!next_button || next_loading}
                            loading={next_loading}
                            primary
                            onClick={this.stopPart} >
                      Next
                    </Button>
                  </Table.Cell>
                  <Table.Cell width={6}>
                    <Message compact
                             negative={!backup_online}
                             positive={backup_online}
                             className='timer' >{backup_timer}</Message>
                  </Table.Cell>
                  <Table.Cell>
                    <Button fluid size='huge'
                            disabled={line_id === "" || !backup_online || stop_loading}
                            loading={stop_loading}
                            negative
                            onClick={this.stopCapture} >
                      Stop
                    </Button>
                  </Table.Cell>
                </Table.Row>
              </Table>
            </Segment>

            <Dropdown
              fluid
              className="preset"
              error={!line_id}
              scrolling={false}
              placeholder={backup_online ? "--- SET PRESET ---" : "--- PRESS START ---"}
              selection
              value={line_id}
              disabled={jsonst?.next_part || !backup_online}
              options={options}
              onChange={(e,{value}) => this.saveLine(value)}
            >
            </Dropdown>

            <Divider />

            {/*<video ref="v1" autoPlay controls={false} muted />*/}
            {/*<audio ref="a1" autoPlay controls={false} muted />*/}
            {/*<audio ref="a2" autoPlay controls={false} muted />*/}
            {/*<audio ref="a3" autoPlay controls={false} muted />*/}
            {/*<audio ref="a4" autoPlay controls={false} muted />*/}

          </Segment>
        )

        return (

            <Fragment>
                {allow ? content : login}
            </Fragment>
        );
    }
}

export default Monitor;
