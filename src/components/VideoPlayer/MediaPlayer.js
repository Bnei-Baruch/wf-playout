import React, { Component } from 'react';
import MediaElement from './MediaElement';

export default class MediaPlayer extends Component {

  // Other code

  render() {
    const
      sources = [
        {src: this.props.source, type: this.props.type},
      ],
      config = {
        alwaysShowControls: true,
        autoRewind: false,
        alwaysShowHours: true,
        showTimecodeFrameCount: false,
        useSmoothHover: false,
        features : ['playpause','tracks','current','progress','duration','volume'],
      },

      tracks = {}
    ;

    return (
      <MediaElement {...this.props}
        id="player1"
        mediaType='video'
        preload="true"
        controls
        width="640"
        height="360"
        poster=""
        sources={JSON.stringify(sources)}
        options={JSON.stringify(config)}
        tracks={JSON.stringify(tracks)}
      />);
  }
}
