import log from "loglevel";
import {JanusMqtt} from "../lib/janus-mqtt";
import {SubscriberPlugin} from "../lib/subscriber-plugin";
import {randomString} from "shared/tools";
import mqtt from "./mqtt";


let janus, subscriber, session, handle

export const getStats = () => {
    console.log(janus)
    const request = {
        janus: "handle_info",
        session_id: session,
        handle_id: handle,
        transaction: randomString(12),
        admin_secret: "janusoverlord"
    }

    mqtt.send(JSON.stringify(request), false, "janus/live/to-janus-admin", "janus/live/from-janus-admin")
}

export const initJanus = (user, gxy, cb) => {
    log.info("[Janus] Janus init")
    janus = new JanusMqtt(user, gxy, gxy);
    janus.init("token").then(data => {
        log.info("[Janus] Janus init success", data)
        initPlugin(cb)
    }).catch(err => {
        log.error("[Janus] Janus init", err);
    })
    janus.onStatus = (srv, status) => {
        if (status !== "online") {
            log.error("["+srv+"] Janus: ", status);
            setTimeout(() => {
                initJanus(user, srv);
            }, 10000)
        }
    }
}

export const destroyJanus = () =>{
    if(janus) janus.destroy()
}

const initPlugin = (callback) => {

    subscriber = new SubscriberPlugin();

    subscriber.onTrack = callback

    subscriber.onUpdate = onUpdateStreams;
    let subscription = [{feed: 1, mid: "0"},{feed: 1, mid: "1"}]

    janus.attach(subscriber).then(data => {
        log.info("[subscriber] Subscriber Handle: ", data)
        subscriber.join(subscription, 1234).then(data => {
            log.info("[subscriber] join: ", data)
            let user = JSON.parse(data.streams[0].feed_display)
            session = user.session;
            handle = user.handle;
            onUpdateStreams(data.streams);
        });
    })
};

const onUpdateStreams = (streams) => {
    log.info("[subscriber] Streams updated: ", streams)
}

const onRemoteTrack = (track, mid, on) => {
    let {mids} = this.state;
    let feed = mids[mid].feed_id;
    if (track.kind === "video" && on) {
        let stream = new MediaStream([track]);
        let remotevideo = this.refs["pv" + feed];
        if (remotevideo) remotevideo.srcObject = stream;
    }
}

const initVideoRoom = (room, inst) => {
    const {gateways, user, q, col} = this.props;
    let janus = gateways[inst];
    const mit = "col" + col + "_q" + (q+1) + "_" + inst

    log.info("["+mit+"] Init room: ", room, inst, ConfigStore.globalConfig)
    log.info("["+mit+"] mit", mit)

    this.setState({mit, janus});

    this.initVideoHandles(janus, room, user)
}

const initVideoHandles = (janus, room, user, mit) => {
    let videoroom = new PublisherPlugin();
    videoroom.subTo = this.onJoinFeed;
    videoroom.unsubFrom = this.unsubscribeFrom
    videoroom.talkEvent = this.handleTalking

    janus.attach(videoroom).then(data => {
        log.info("["+mit+"] Publisher Handle: ", data)

        videoroom.join(room, user).then(data => {
            log.info("["+mit+"] Joined respond :", data)
            this.setState({videoroom, user, room, remoteFeed: null});
            this.onJoinMe(data.publishers, room)
        }).catch(err => {
            log.error("["+mit+"] Join error :", err);
        })
    })
}

const onJoinMe = (list, room) => {
    const {mit} = this.state;
    let feeds = list;
    log.info("["+mit+"] Got publishers list: ", feeds);
    let subscription = [];
    for (let f in feeds) {
        let id = feeds[f]["id"];
        let display = feeds[f]["display"];
        let talking = feeds[f]["talking"];
        let streams = feeds[f]["streams"];
        feeds[f].display = display;
        feeds[f].talking = talking;
        for (let i in streams) {
            let stream = streams[i];
            stream["id"] = id;
            stream["display"] = display;
            if (stream.type === "video" && stream.codec === "h264") {
                subscription.push({feed: id, mid: stream.mid});
            }
        }
    }
    this.setState({feeds});
    if (subscription.length > 0) {
        this.subscribeTo(room, subscription);
    }
}

const onJoinFeed = (feed) => {
    let {feeds, room, mit} = this.state;
    log.info("["+mit+"] Feed enter: ", feeds);
    let subscription = [];
    for (let f in feed) {
        let id = feed[f]["id"];
        let display = feed[f]["display"];
        let streams = feed[f]["streams"];
        feed[f].display = display;
        for (let i in streams) {
            let stream = streams[i];
            stream["id"] = id;
            stream["display"] = display;
            if (stream.type === "video" && stream.codec === "h264") {
                subscription.push({feed: id, mid: stream.mid});
            }
        }
    }
    const isExistFeed = feeds.find((f) => f.id === feed[0].id);
    if (!isExistFeed) {
        feeds.push(feed[0]);
        this.setState({feeds});
    }
    if (subscription.length > 0) {
        this.subscribeTo(room, subscription);
    }
}

const exitPlugins = (callback) => {
    const {subscriber, videoroom, janus, mit} = this.state;
    if(subscriber) janus.detach(subscriber)
    janus.detach(videoroom).then(() => {
        log.info("["+mit+"] plugin detached:");
        this.setState({feeds: [], mids: [], remoteFeed: false, videoroom: null, subscriber: null, janus: null});
        if(typeof callback === "function") callback();
    })
}

const exitVideoRoom = (roomid, callback) => {
    const {videoroom, mit} = this.state;
    if(videoroom) {
        videoroom.leave().then(r => {
            log.info("["+mit+"] leave respond:", r);
            this.exitPlugins(callback)
        }).catch(e => {
            log.error("["+mit+"] leave error:", e);
            this.exitPlugins(callback)
        });
    } else {
        this.exitPlugins(callback)
    }

};

const subscribeTo = (room, subscription) => {
    let {janus, creatingFeed, remoteFeed, subscriber, mit} = this.state

    if (remoteFeed) {
        subscriber.sub(subscription);
        return;
    }

    if (creatingFeed) {
        setTimeout(() => {
            this.subscribeTo(subscription);
        }, 500);
        return;
    }

    subscriber = new SubscriberPlugin();
    subscriber.onTrack = this.onRemoteTrack;
    subscriber.onUpdate = this.onUpdateStreams;

    janus.attach(subscriber).then(data => {
        this.setState({subscriber});
        log.info("["+mit+"] Subscriber Handle: ", data)
        subscriber.join(subscription, room).then(data => {
            log.info("["+mit+"] Subscriber join: ", data)
            this.onUpdateStreams(data.streams);
            this.setState({remoteFeed: true, creatingFeed: false});
        });
    })
};

const unsubscribeFrom = (id) => {
    id = id[0]
    const {feeds, subscriber, mit} = this.state;
    log.info("["+mit+"] unsubscribeFrom", id);
    for (let i = 0; i < feeds.length; i++) {
        if (feeds[i].id === id) {
            log.info("["+mit+"] unsubscribeFrom feed", feeds[i]);

            feeds.splice(i, 1);

            const streams = [{feed: id}]

            const {remoteFeed} = this.state;
            if (remoteFeed !== null && streams.length > 0) {
                subscriber.unsub(streams);
            }

            this.setState({feeds});
            break;
        }
    }
};

const handleTalking = (id, talking) => {
    const feeds = Object.assign([], this.state.feeds);
    for (let i = 0; i < feeds.length; i++) {
        if (feeds[i] && feeds[i].id === id) {
            feeds[i].talking = talking;
        }
    }
    this.setState({feeds});
}

