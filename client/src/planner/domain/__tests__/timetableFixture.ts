/**
 * Real answers of transport.opendata.ch (2026-10-03), cut to the fields the
 * reader uses — the passing stations, prognoses and capacities dropped. Times
 * are the stop's own local time with its offset; coordinates come as `x` =
 * latitude, `y` = longitude. Pins the shape in a unit test, as the SBB
 * link's fixture does: the day the service changes it is a red test against
 * a fresh fixture, and in the field a polite fallback.
 */
export const CONNECTIONS_FIXTURE = {
  connections: [
    {
      from: {
        station: {
          id: '8507492',
          name: 'Interlaken Ost',
        },
        departure: '2026-10-10T08:04:00+0200',
        arrival: null,
      },
      to: {
        station: {
          id: '8507374',
          name: 'Kleine Scheidegg',
        },
        departure: null,
        arrival: '2026-10-10T09:08:00+0200',
      },
      duration: '00d01:04:00',
      transfers: 1,
      products: ['R'],
      sections: [
        {
          journey: {
            category: 'R',
            number: '62',
          },
          walk: null,
          departure: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: '2026-10-10T08:04:00+0200',
            arrival: null,
          },
          arrival: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: null,
            arrival: '2026-10-10T08:26:00+0200',
          },
        },
        {
          journey: {
            category: 'CC',
            number: '63',
          },
          walk: null,
          departure: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: '2026-10-10T08:30:00+0200',
            arrival: '2026-10-10T08:26:00+0200',
          },
          arrival: {
            station: {
              id: '8507374',
              name: 'Kleine Scheidegg',
            },
            departure: null,
            arrival: '2026-10-10T09:08:00+0200',
          },
        },
      ],
    },
    {
      from: {
        station: {
          id: '8507492',
          name: 'Interlaken Ost',
        },
        departure: '2026-10-10T08:34:00+0200',
        arrival: null,
      },
      to: {
        station: {
          id: '8507374',
          name: 'Kleine Scheidegg',
        },
        departure: null,
        arrival: '2026-10-10T09:38:00+0200',
      },
      duration: '00d01:04:00',
      transfers: 1,
      products: ['R'],
      sections: [
        {
          journey: {
            category: 'R',
            number: '62',
          },
          walk: null,
          departure: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: '2026-10-10T08:34:00+0200',
            arrival: null,
          },
          arrival: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: null,
            arrival: '2026-10-10T08:56:00+0200',
          },
        },
        {
          journey: {
            category: 'CC',
            number: '63',
          },
          walk: null,
          departure: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: '2026-10-10T09:00:00+0200',
            arrival: '2026-10-10T08:56:00+0200',
          },
          arrival: {
            station: {
              id: '8507374',
              name: 'Kleine Scheidegg',
            },
            departure: null,
            arrival: '2026-10-10T09:38:00+0200',
          },
        },
      ],
    },
    {
      from: {
        station: {
          id: '8507000',
          name: 'Bern',
        },
        departure: '2026-10-10T08:04:00+0200',
        arrival: null,
      },
      to: {
        station: {
          id: '8507384',
          name: 'Lauterbrunnen',
        },
        departure: null,
        arrival: '2026-10-10T09:26:00+0200',
      },
      duration: '00d01:22:00',
      transfers: 1,
      products: ['IC 81', 'R'],
      sections: [
        {
          journey: {
            category: 'IC',
            number: '81',
          },
          walk: null,
          departure: {
            station: {
              id: '8507000',
              name: 'Bern',
            },
            departure: '2026-10-10T08:04:00+0200',
            arrival: null,
          },
          arrival: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: null,
            arrival: '2026-10-10T08:59:00+0200',
          },
        },
        {
          journey: {
            category: 'R',
            number: '62',
          },
          walk: null,
          departure: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: '2026-10-10T09:04:00+0200',
            arrival: '2026-10-10T08:59:00+0200',
          },
          arrival: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: null,
            arrival: '2026-10-10T09:26:00+0200',
          },
        },
      ],
    },
    {
      from: {
        station: {
          id: '8507000',
          name: 'Bern',
        },
        departure: '2026-10-10T08:34:00+0200',
        arrival: null,
      },
      to: {
        station: {
          id: '8507384',
          name: 'Lauterbrunnen',
        },
        departure: null,
        arrival: '2026-10-10T09:56:00+0200',
      },
      duration: '00d01:22:00',
      transfers: 1,
      products: ['IC 61', 'R'],
      sections: [
        {
          journey: {
            category: 'IC',
            number: '61',
          },
          walk: null,
          departure: {
            station: {
              id: '8507000',
              name: 'Bern',
            },
            departure: '2026-10-10T08:34:00+0200',
            arrival: null,
          },
          arrival: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: null,
            arrival: '2026-10-10T09:28:00+0200',
          },
        },
        {
          journey: {
            category: 'R',
            number: '62',
          },
          walk: null,
          departure: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: '2026-10-10T09:34:00+0200',
            arrival: '2026-10-10T09:28:00+0200',
          },
          arrival: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: null,
            arrival: '2026-10-10T09:56:00+0200',
          },
        },
      ],
    },
    {
      from: {
        station: {
          id: '8507000',
          name: 'Bern',
        },
        departure: '2026-10-10T09:04:00+0200',
        arrival: null,
      },
      to: {
        station: {
          id: '8507384',
          name: 'Lauterbrunnen',
        },
        departure: null,
        arrival: '2026-10-10T10:26:00+0200',
      },
      duration: '00d01:22:00',
      transfers: 1,
      products: ['ICE', 'R'],
      sections: [
        {
          journey: {
            category: 'ICE',
            number: '000271',
          },
          walk: null,
          departure: {
            station: {
              id: '8507000',
              name: 'Bern',
            },
            departure: '2026-10-10T09:04:00+0200',
            arrival: null,
          },
          arrival: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: null,
            arrival: '2026-10-10T09:59:00+0200',
          },
        },
        {
          journey: {
            category: 'R',
            number: '62',
          },
          walk: null,
          departure: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: '2026-10-10T10:04:00+0200',
            arrival: '2026-10-10T09:59:00+0200',
          },
          arrival: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: null,
            arrival: '2026-10-10T10:26:00+0200',
          },
        },
      ],
    },
  ],
}

export const LOCATIONS_FIXTURE = {
  stations: [
    {
      id: '8507384',
      name: 'Lauterbrunnen',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.59842,
        y: 7.908077,
      },
      distance: null,
      icon: 'train',
    },
    {
      id: '8571318',
      name: 'Lauterbrunnen, Bahnhof',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.598962,
        y: 7.907559,
      },
      distance: null,
      icon: 'bus',
    },
    {
      id: '8580370',
      name: 'Lauterbrunnen, Dorf',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.595337,
        y: 7.907424,
      },
      distance: null,
      icon: 'bus',
    },
    {
      id: '8571319',
      name: 'Lauterbrunnen, Ey',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.593432,
        y: 7.909156,
      },
      distance: null,
      icon: 'bus',
    },
  ],
}

/** Around 46.6 N, 7.9 E: an address without an id first, then stops by distance. */
export const NEAR_FIXTURE = {
  stations: [
    {
      id: null,
      name: 'Alpweg 76b, Lauterbrunnen',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: null,
        y: null,
      },
      distance: 20.228669431898314,
      icon: null,
    },
    {
      id: '8507377',
      name: 'Lauterbrunnen (Seilbahn)',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.598747,
        y: 7.907166,
      },
      distance: 566,
      icon: null,
    },
    {
      id: '8571318',
      name: 'Lauterbrunnen, Bahnhof',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.598962,
        y: 7.907559,
      },
      distance: 591,
      icon: 'bus',
    },
    {
      id: '8507384',
      name: 'Lauterbrunnen',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.59842,
        y: 7.908077,
      },
      distance: 643,
      icon: 'train',
    },
  ],
}

/**
 * Luzern to Vitznau by lake steamer (2026-10-04), with the stations the boat
 * calls at on the way (`passList`) and the walk to the pier first — what the
 * connection's map is drawn from.
 */
export const BOAT_FIXTURE = {
  connections: [
    {
      sections: [
        {
          journey: null,
          walk: {
            duration: null,
          },
          departure: {
            station: {
              id: '8505000',
              name: 'Luzern',
              coordinate: {
                type: 'WGS84',
                x: 47.050165,
                y: 8.310172,
              },
            },
            departure: '2026-10-10T08:05:00+0200',
          },
          arrival: {
            station: {
              id: '8508492',
              name: 'Luzern Bahnhofquai',
              coordinate: {
                type: 'WGS84',
                x: 47.051182,
                y: 8.310136,
              },
            },
            arrival: '2026-10-10T08:12:00+0200',
          },
        },
        {
          journey: {
            category: 'BAT',
            number: '3600',
            passList: [
              {
                station: {
                  id: '8508492',
                  name: 'Luzern Bahnhofquai',
                  coordinate: {
                    type: 'WGS84',
                    x: 47.051182,
                    y: 8.310136,
                  },
                },
                arrival: '2026-10-10T08:12:00+0200',
                departure: '2026-10-10T08:12:00+0200',
              },
              {
                station: {
                  id: '8508459',
                  name: 'Verkehrshaus-Lido',
                  coordinate: {
                    type: 'WGS84',
                    x: 47.0511,
                    y: 8.334865,
                  },
                },
                arrival: '2026-10-10T08:22:00+0200',
                departure: '2026-10-10T08:22:00+0200',
              },
              {
                station: {
                  id: '8508462',
                  name: 'Hertenstein (See)',
                  coordinate: {
                    type: 'WGS84',
                    x: 47.026876,
                    y: 8.403448,
                  },
                },
                arrival: '2026-10-10T08:43:00+0200',
                departure: '2026-10-10T08:43:00+0200',
              },
              {
                station: {
                  id: '8508463',
                  name: 'Weggis',
                  coordinate: {
                    type: 'WGS84',
                    x: 47.031408,
                    y: 8.433211,
                  },
                },
                arrival: '2026-10-10T08:53:00+0200',
                departure: '2026-10-10T08:53:00+0200',
              },
              {
                station: {
                  id: '8508464',
                  name: 'Vitznau',
                  coordinate: {
                    type: 'WGS84',
                    x: 47.009345,
                    y: 8.482383,
                  },
                },
                arrival: '2026-10-10T09:09:00+0200',
                departure: null,
              },
            ],
          },
          walk: null,
          departure: {
            station: {
              id: '8508492',
              name: 'Luzern Bahnhofquai',
              coordinate: {
                type: 'WGS84',
                x: 47.051182,
                y: 8.310136,
              },
            },
            departure: '2026-10-10T08:12:00+0200',
          },
          arrival: {
            station: {
              id: '8508464',
              name: 'Vitznau',
              coordinate: {
                type: 'WGS84',
                x: 47.009345,
                y: 8.482383,
              },
            },
            arrival: '2026-10-10T09:09:00+0200',
          },
        },
      ],
    },
  ],
}

/** Around Luzern station: an address without an id first, then stops with their distance in metres. */
export const NEAR_LUZERN_FIXTURE = {
  stations: [
    {
      id: null,
      name: 'Bahnhofplatz 2, Luzern',
      coordinate: {
        type: 'WGS84',
        x: null,
        y: null,
      },
      distance: 22.8158708651517,
    },
    {
      id: '8505000',
      name: 'Luzern',
      coordinate: {
        type: 'WGS84',
        x: 47.050165,
        y: 8.310172,
      },
      distance: 66,
    },
    {
      id: '8508450',
      name: 'Luzern, Bahnhof',
      coordinate: {
        type: 'WGS84',
        x: 47.05074,
        y: 8.310247,
      },
      distance: 94,
    },
    {
      id: '8508492',
      name: 'Luzern Bahnhofquai',
      coordinate: {
        type: 'WGS84',
        x: 47.051182,
        y: 8.310136,
      },
      distance: 126,
    },
    {
      id: '8589801',
      name: 'Luzern, Kantonalbank',
      coordinate: {
        type: 'WGS84',
        x: 47.048855,
        y: 8.306229,
      },
      distance: 277,
    },
  ],
}
