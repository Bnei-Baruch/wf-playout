import React, { Component } from 'react';
import {kc,getUser} from './UserManager';
import {Container,Message,Button,Dropdown,Image, Divider} from 'semantic-ui-react';
import logo from './logo.png';
import {KC_URL} from "../shared/tools";

class LoginPage extends Component {

    state = {
        disabled: true,
        loading: true,
    };

    componentDidMount() {
        this.appLogin();
    };

    appLogin = () => {
        getUser((user) => {
            if(user) {
                this.setState({loading: false});
                this.props.checkPermission(user);
            } else {
                this.setState({disabled: false, loading: false});
            }
        });
    };

    userLogin = () => {
        this.setState({disabled: true, loading: true});
        kc.login({redirectUri: window.location.href});
    };

    render() {

        const {user, allow} = this.props;
        const {disabled, loading} = this.state;

        let login = (<Button size='massive' primary onClick={this.userLogin} disabled={disabled} loading={loading}>Login</Button>);
        let logout = (<Image src={logo} centered />);
        let profile = (
            <Dropdown inline text=''>
                <Dropdown.Menu>
                    <Dropdown.Item content='Profile:' disabled />
                    <Dropdown.Item text='My Account' onClick={() => window.open(`${KC_URL}/realms/main/account`, "_blank")} />
                    <Dropdown.Item text='Sign Out' onClick={() => kc.logout()} />
                </Dropdown.Menu>
            </Dropdown>);

        return (
            <Container textAlign='center' >
                <Message size='massive'>
                    <Message.Header>
                        {user ? "Welcome, " + user.name : "BB Services Monitor"}
                        {user ? profile : ""}
                    </Message.Header>
                    <Divider horizontal>-</Divider>
                    {allow === false && "You does not have permission"}
                    {user ? logout : login}
                </Message>
            </Container>
        );
    }
}

export default LoginPage;
