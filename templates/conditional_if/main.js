const data = $$().createData({
  message: "to QueryScript",
  test: "from Data",
});

$$("#app", {
  data,
  methods: {
    updateMessage: function (text = "to QueryScript") {
      this.message = this.message === text ? this.test : text;
    },
  },
});
