import React, {Component} from 'react';
import {Segment} from 'semantic-ui-react'
import 'fomantic-ui-css/semantic.min.css';
import './App.css';
import PlayBrowser from "./components/PlayBrowser";
import PlayOut from "./components/PlayOut";

class App extends Component {

    state = {};

  render() {

    return (
        <Segment basic>
            {/*<PlayBrowser />*/}
            <PlayOut />
        </Segment>
    );
  }
}

export default App;
