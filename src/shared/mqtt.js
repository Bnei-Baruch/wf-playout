import mqtt from 'mqtt';
import {MQTT_URL, randomString} from "./tools";
import log from "loglevel";

class MqttMsg {

    constructor() {
        this.user = null;
        this.mq = null;
        this.connected = false;
        this.room = null;
        this.token = null;
    }

    init = (user, callback) => {
        this.user = user;

        const transformUrl = (url, options, client) => {
            client.options.password = this.token;
            return url;
        };

        let options = {
            keepalive: 10,
            connectTimeout: 10 * 1000,
            clientId: user.id + "-" + randomString(3),
            protocolId: 'MQTT',
            protocolVersion: 5,
            clean: true,
            username: user.email,
            password: this.token,
            transformWsUrl: transformUrl,
        };

        this.mq = mqtt.connect(`wss://${MQTT_URL}`, options);
        this.mq.setMaxListeners(50)

        this.mq.on('connect', (data) => {
            if(data && !this.connected) {
                console.log("[mqtt] Connected to server: ", data);
                this.connected = true;
                callback(data)
            }
        });

        this.mq.on('error', (data) => console.error('[mqtt] Error: ', data));
        this.mq.on('disconnect', (data) => console.error('[mqtt] Error: ', data));
    }

    join = (topic) => {
        console.debug("[mqtt] Subscribe to: ", topic)
        let options = {qos: 1, nl: true}
        this.mq.subscribe(topic, {...options}, (err) => {
            err && console.error('[mqtt] Error: ', err);
        })
    }

    exit = (topic) => {
        let options = {}
        console.debug("[mqtt] Unsubscribe from: ", topic)
        this.mq.unsubscribe(topic, {...options} ,(err) => {
            err && console.error('[mqtt] Error: ',err);
        })
    }

    // send = (message, retain, topic) => {
    //     console.debug("[mqtt] Send data on topic: ", topic, message)
    //     let options = {qos: 1, retain};
    //     this.mq.publish(topic, message, {...options}, (err) => {
    //         err && console.error('[mqtt] Error: ',err);
    //     })
    // }

    send = (message, retain, topic, rxTopic, user) => {
        if (!this.mq) return;
        log.debug("%c[mqtt] --> send message | topic: " + topic + " | data: " + message, "color: darkgrey");
        let properties = !!rxTopic ? {userProperties: user || this.user, responseTopic: rxTopic} : {userProperties: user || this.user};
        let options = {qos: 1, retain, properties};
        this.mq.publish(topic, message, {...options}, (err) => {
            err && log.error("[mqtt] Error: ", err);
        });
    };

    watch = (callback, stat) => {
        this.mq.on('message',  (topic, data, packet) => {
            let cd = packet?.properties?.correlationData ? " | transaction: " + packet?.properties?.correlationData?.toString() : ""
            let msg
            try {
                msg = JSON.parse(data);
                log.debug("%c[mqtt] <-- receive message" + cd + " | topic : " + topic, "color: darkgrey", msg);
                callback(msg, topic);
                return
            } catch (e) {
                log.debug("%c[mqtt] <-- receive message" + cd + " | topic : " + topic, "color: darkgrey", data.toString());
                callback(data.toString(), topic);
                return
            }

            const t = topic.split("/")
            const [root, service, id, target] = t
            switch(root) {
                case "janus":
                    const json = JSON.parse(data)
                    const mit = json?.session_id || packet?.properties?.userProperties?.mit || service
                    if(id === "from-janus-admin") {
                        callback(JSON.parse(data.toString()), topic);
                    } else {
                        this.mq.emit(mit, data, id);
                    }
                    break;
                default:
                    if(typeof callback === "function")
                        callback(JSON.parse(data.toString()), topic);
            }
        })
    }

    setToken = (token) => {
        this.token = token;
    }

}

const defaultMqtt = new MqttMsg();

export default defaultMqtt;



