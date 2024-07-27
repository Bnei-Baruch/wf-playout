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

        let encoders = Object.keys(streamer).map((key, i) => {
            if(key.match(/^(encoders|restream)$/)) {
                return (
                    <List key={'enc' + key} divided selection>
                        {Object.keys(streamer[key]).map((val, i) => {
                            return (
                                <List.Item key={val}>
                                    <Label key={val} color={status[val] ? 'green' : 'red'} horizontal>
                                        {status[val] ? 'Online' : 'Offline'}
                                    </Label>
                                    {val}
                                </List.Item>
                            )
                        })}
                    </List>
                )
            }
        });

        let cpr = Object.keys(streamer).map((key, i) => {
            if(key.match(/^(captures|playouts)$/)) {
                return (
                    <List key={'cpr' + key} divided selection>
                        {Object.keys(streamer[key]).map((val, i) => {
                            return (
                                <List.Item key={val}>
                                    <Label key={val} color={status[val] ? 'green' : 'red'} horizontal>
                                        {status[val] ? 'Online' : 'Offline'}
                                    </Label>
                                    {val}
                                </List.Item>
                            )
                        })}
                    </List>
                )
            }
        });

        let wf = (
                <List key='wf' divided selection>
                    {Object.keys(workflow).map((val, i) => {
                        return (
                            <List.Item key={val}>
                                <Label key={val} color={workflow[val] ? 'green' : 'red'} horizontal>
                                    {workflow[val] ? 'Online' : 'Offline'}
                                </Label>
                                {val}
                            </List.Item>
                        )
                    })}
                </List>
            );

        let gxy = (
            <List key='gxy' divided selection>
                {Object.keys(galaxy).map((val, i) => {
                    return (
                        <List.Item key={val}>
                            <Label key={val} color={galaxy[val] ? 'green' : 'red'} horizontal>
                                {galaxy[val] ? 'Online' : 'Offline'}
                            </Label>
                            {val}
                        </List.Item>
                    )
                })}
            </List>
        );

        let str = (
            <List key='str' divided selection>
                {Object.keys(stream).map((val, i) => {
                    return (
                        <List.Item key={val}>
                            <Label key={val} color={stream[val] ? 'green' : 'red'} horizontal>
                                {stream[val] ? 'Online' : 'Offline'}
                            </Label>
                            {val}
                        </List.Item>
                    )
                })}
            </List>
        );

        let jns = (
            <List key='jns' divided selection>
                {Object.keys(janus).map((val, i) => {
                    return (
                        <List.Item key={val}>
                            <Label key={val} color={janus[val] ? 'green' : 'red'} horizontal>
                                {janus[val] ? 'Online' : 'Offline'}
                            </Label>
                            {val}
                        </List.Item>
                    )
                })}
            </List>
        );


        let content = (
            <Grid columns={5} divided>
                <Grid.Row>
                    <Grid.Column>
                        <Message>Shdiur</Message>
                    </Grid.Column>
                    <Grid.Column>
                        <Message>Workflow</Message>
                    </Grid.Column>
                    <Grid.Column>
                        <Message>Galaxy</Message>
                    </Grid.Column>
                    <Grid.Column>
                        <Message>Stream</Message>
                    </Grid.Column>
                    <Grid.Column>
                        <Message>Janus</Message>
                    </Grid.Column>
                </Grid.Row>
                <Grid.Row stretched>
                    <Grid.Column>
                        <Message>{encoders}</Message>
                    </Grid.Column>
                    <Grid.Column>
                        <Message>{cpr}{wf}</Message>
                    </Grid.Column>
                    <Grid.Column>
                        <Message>{gxy}</Message>
                    </Grid.Column>
                    <Grid.Column>
                        <Message>{str}</Message>
                    </Grid.Column>
                    <Grid.Column>
                        <Message>{jns}</Message>
                    </Grid.Column>
                </Grid.Row>
            </Grid>
        )

        return (

            <Fragment>
                {allow ? content : login}
            </Fragment>
        );
    }
}

export default Monitor;
